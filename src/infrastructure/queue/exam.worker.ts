import { injectable, inject } from 'tsyringe';
import { Worker, type Job, Queue } from 'bullmq';
import type Redis from 'ioredis';
import { env } from '../../config/env';
import { REDIS_KEY_PREFIX } from '../../config/redis.constants';
import type { IAppLogger } from '../../application/ports/logger.port';
import type { IExamJobData } from '../../application/ports/examPipelineQueue.port';
import { ProcessExamPipelineUseCase } from '../../application/useCases/processExamPipeline.useCase';
import type { IQueueRedisConnectionProvider } from '../../application/ports/queueRedisConnectionProvider.port';

@injectable()
export class ExamWorker {
  private worker: Worker<IExamJobData, void> | null = null;
  private queue: Queue<IExamJobData, void> | null = null;
  private connection: Redis | null = null;
  private watchdogInterval: NodeJS.Timeout | null = null;

  constructor(
    @inject('QUEUE_CONCURRENCY') private readonly concurrency: number,
    @inject('IAppLogger') private readonly logger: IAppLogger,
    @inject('ProcessExamPipelineUseCase') private readonly processExamPipeline: ProcessExamPipelineUseCase,
    @inject('IQueueRedisConnectionProvider') private readonly redisProvider: IQueueRedisConnectionProvider
  ) {}

  async initialize(): Promise<void> {
    if (this.worker !== null) {
      return;
    }

    try {
      this.connection = await this.redisProvider.getConnection();

      this.queue = new Queue<IExamJobData, void>(env.queueName, {
        connection: this.connection,
        prefix: `${REDIS_KEY_PREFIX}bull`,
      });

      this.worker = new Worker<IExamJobData, void>(
        env.queueName,
        async (job: Job<IExamJobData>) => {
          this.logger.info('Worker started processing exam', { examId: job.data.examId });

          // Monitor queue depth
          if (this.queue) {
            try {
              const waiting = await this.queue.getWaitingCount();
              if (waiting > 100) {
                this.logger.warn('Worker processing job while queue depth is high', {
                  waitingCount: waiting,
                  examId: job.data.examId,
                });
              }
            } catch (err) {
              this.logger.warn('Failed to check queue depth', {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          try {
            await this.processExamPipeline.execute(job.data);
            this.logger.info('Worker finished processing exam', { examId: job.data.examId });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error('Worker failed processing exam', { examId: job.data.examId, error: message });
            throw error;
          }
        },
        {
          connection: this.connection,
          concurrency: this.concurrency,
          prefix: `${REDIS_KEY_PREFIX}bull`,
          removeOnComplete: { count: 0 }, // Remove immediately
          removeOnFail: { count: 10 },
        }
      );

      this.worker.on('error', (error) => {
        this.logger.error('Exam worker error', { error: error.message });
      });

      this.setupLockCleanup();

      this.logger.info('Exam worker initialized successfully', { concurrency: this.concurrency });
    } catch (error) {
      await this.redisProvider.releaseConnection();
      this.connection = null;
      throw error;
    }
  }

  private setupLockCleanup(): void {
    // Periodically clean up stalled jobs
    this.watchdogInterval = setInterval(
      () => {
        if (this.queue) {
          this.queue.clean(60000, 1000, 'active').catch((err) => {
            this.logger.warn('Failed to clean active stalled jobs', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      },
      5 * 60 * 1000
    ); // Every 5 minutes
  }

  async close(): Promise<void> {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }

    if (this.worker !== null) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.queue !== null) {
      await this.queue.close();
      this.queue = null;
    }

    if (this.connection !== null) {
      await this.redisProvider.releaseConnection();
      this.connection = null;
    }

    this.logger.info('Exam worker closed');
  }
}

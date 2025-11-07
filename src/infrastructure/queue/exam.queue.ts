import { injectable, inject } from 'tsyringe';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { env } from '../../config/env';
import { REDIS_KEY_PREFIX, QUEUE_JOB_ATTEMPTS, QUEUE_JOB_BACKOFF_DELAY } from '../../config/redis.constants';
import type { IAppLogger } from '../../application/ports/logger.port';
import type { IExamJobData, IExamPipelineQueue } from '../../application/ports/examPipelineQueue.port';
import type { IQueueRedisConnectionProvider } from '../../application/ports/queueRedisConnectionProvider.port';

@injectable()
export class ExamQueue implements IExamPipelineQueue {
  private queue: Queue<IExamJobData, void> | null = null;
  private connection: Redis | null = null;

  constructor(
    @inject('QUEUE_MAX_SIZE') private readonly maxSize: number,
    @inject('IAppLogger') private readonly logger: IAppLogger,
    @inject('IQueueRedisConnectionProvider') private readonly redisProvider: IQueueRedisConnectionProvider
  ) {}

  async initialize(): Promise<void> {
    if (this.queue !== null) {
      return;
    }

    try {
      this.connection = await this.redisProvider.getConnection();

      this.queue = new Queue<IExamJobData, void>(env.queueName, {
        connection: this.connection,
        prefix: `${REDIS_KEY_PREFIX}bull`,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: {
            count: 10,
          },
          attempts: QUEUE_JOB_ATTEMPTS, // Business logic failures should not be blindly retried to avoid double refunds
          backoff: {
            type: 'exponential',
            delay: QUEUE_JOB_BACKOFF_DELAY,
          },
        },
      });

      this.logger.info('Exam queue initialized successfully');
    } catch (error) {
      await this.redisProvider.releaseConnection();
      this.connection = null;
      throw error;
    }
  }

  getQueue(): Queue<IExamJobData, void> {
    if (this.queue === null) {
      throw new Error('Exam queue not initialized');
    }
    return this.queue;
  }

  async enqueueExam(jobData: IExamJobData): Promise<string | null> {
    const queue = this.getQueue();
    const waiting = await queue.getWaitingCount();

    if (waiting >= this.maxSize) {
      this.logger.error('Queue is full, rejecting new job', { waiting, maxSize: this.maxSize });
      throw new Error('Queue is full. Please try again later.');
    }

    const job = await queue.add('process-exam', jobData, {
      jobId: `exam-${jobData.examId}`, // Deduplication by examId
    });

    this.logger.info('Exam enqueued successfully', {
      examId: jobData.examId,
      jobId: job.id,
    });

    return job.id ?? null;
  }

  async close(): Promise<void> {
    if (this.queue !== null) {
      await this.queue.close();
      this.queue = null;
    }

    if (this.connection !== null) {
      await this.redisProvider.releaseConnection();
      this.connection = null;
    }

    this.logger.info('Exam queue closed');
  }
}

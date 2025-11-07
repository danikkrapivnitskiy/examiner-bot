import { injectable, inject } from 'tsyringe';
import type { IExamJobData, IExamPipelineQueue } from '../../application/ports/examPipelineQueue.port';

@injectable()
export class EnqueueExamPipelineUseCase {
  constructor(@inject('IExamPipelineQueue') private readonly examQueue: IExamPipelineQueue) {}

  async execute(input: IExamJobData): Promise<void> {
    await this.examQueue.enqueueExam(input);
  }
}

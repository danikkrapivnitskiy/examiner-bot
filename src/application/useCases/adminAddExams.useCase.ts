import { injectable, inject } from 'tsyringe';
import type { IUserRepository } from '../ports/userRepository.port';
import type { IAppLogger } from '../ports/logger.port';

export type AdminAddExamsOutcome = { ok: true } | { ok: false; error: string };

@injectable()
export class AdminAddExamsUseCase {
  constructor(
    @inject('IUserRepository') private readonly usersRepo: IUserRepository,
    @inject('IAppLogger') private readonly logger: IAppLogger
  ) {}

  async execute(params: { targetUserId: bigint; amount: number }): Promise<AdminAddExamsOutcome> {
    try {
      await this.usersRepo.addSubscription(params.targetUserId, params.amount);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error adding exams', { error: message, targetUserId: String(params.targetUserId) });
      return { ok: false, error: message };
    }
  }
}

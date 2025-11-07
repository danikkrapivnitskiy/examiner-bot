import { injectable, inject } from 'tsyringe';
import { examFallbackMidScoreFraction } from '../../config/exam.constants';
import { examFinalReportLlm } from '../../config/llm.constants';
import type { ExamState } from '../../domain/exam/examState.entity';

import { examFinalReportLlmSchema, type ExamFinalReport } from '../exam/examFinalReport.schema';
import { buildGenerateFinalReportSystemPrompt } from '../prompts/systemPrompts';
import type { IExamSessionRepository } from '../ports/examSessionRepository.port';
import type { IUserRepository } from '../ports/userRepository.port';
import type { IExamStateCache } from '../ports/examStateCache.port';
import type { ILlmClient } from '../ports/llmClient.port';
import type { IAppLogger } from '../ports/logger.port';

import type { IStatisticsService } from '../ports/statisticsService.port';

export type FinishExamOutcome =
  | {
      ok: true;
      report: ExamFinalReport;
    }
  | {
      ok: false;
      error: string;
    };

import { env } from '../../config/env';

@injectable()
export class FinishExamUseCase {
  constructor(
    @inject('IExamStateCache') private readonly examCache: IExamStateCache,
    @inject('ILlmClient') private readonly llm: ILlmClient | null,
    @inject('IExamSessionRepository') private readonly exams: IExamSessionRepository,
    @inject('IUserRepository') private readonly users: IUserRepository,
    @inject('IAppLogger') private readonly logger: IAppLogger,
    @inject('IStatisticsService') private readonly statisticsService: IStatisticsService
  ) {}

  async execute(params: { telegramUserId: number; dbUserId: bigint; state: ExamState }): Promise<FinishExamOutcome> {
    const { state } = params;

    const report = await this.buildFinalReport(state);
    const statisticsBody = JSON.stringify({
      feedback: report.feedback,
    });

    try {
      await this.exams.completeExam({
        examId: state.examId,
        userId: params.dbUserId,
        score: state.score,
        maxScore: state.totalQuestions * 3,
        feedback: statisticsBody,
      });

      // Track statistics
      await this.statisticsService.trackExamCompleted(params.telegramUserId).catch(() => {});
      await this.statisticsService.trackTopUser(params.telegramUserId, 1).catch(() => {});

      try {
        const dbUser = await this.users.getUserById(params.dbUserId);
        if (dbUser?.referredBy) {
          const completedExams = await this.exams.getRecentCompletedExams(params.dbUserId, 2);
          if (completedExams.length === 1) {
            await this.users.addSubscription(dbUser.referredBy, env.REFERRAL_BONUS_DAYS);
            this.logger.info('Referral bonus granted', {
              referrerId: String(dbUser.referredBy),
              referredUserId: String(params.dbUserId),
              examId: state.examId,
            });
          }
        }
      } catch (rewardError) {
        this.logger.error('Failed to process referral reward', {
          error: rewardError instanceof Error ? rewardError.message : String(rewardError),
          userId: String(params.dbUserId),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to persist finished exam', {
        error: message,
        examId: state.examId,
        userId: String(params.dbUserId),
      });
      await this.examCache.deleteExamState(params.telegramUserId);
      return { ok: false, error: 'Failed to save exam completion.' };
    }

    await this.examCache.deleteExamState(params.telegramUserId);

    return { ok: true, report };
  }

  private async buildFinalReport(state: ExamState): Promise<ExamFinalReport> {
    if (state.currentIndex === 0) {
      return this.fallbackReport(state);
    }

    if (!this.llm) {
      return this.fallbackReport(state);
    }

    const maxScore = state.totalQuestions * 3;
    const percent = Math.round((state.score / maxScore) * 100);

    const userPayload = JSON.stringify({
      scorePercent: percent,
      weakTopics: state.weakTopics,
    });

    try {
      const result = await this.llm.generateChatCompletion(
        [
          { role: 'system', content: buildGenerateFinalReportSystemPrompt() },
          { role: 'user', content: userPayload },
        ],
        { jsonMode: true, ...examFinalReportLlm }
      );

      let parsed: unknown;
      try {
        parsed = JSON.parse(result.content.trim()) as unknown;
      } catch {
        this.logger.warn('Final report LLM returned invalid JSON; using fallback summary');
        return this.fallbackReport(state);
      }

      const validated = examFinalReportLlmSchema.safeParse(parsed);
      if (!validated.success) {
        this.logger.warn('Final report LLM returned unexpected shape; using fallback summary');
        return this.fallbackReport(state);
      }

      const percent = Math.round((state.score / maxScore) * 100);

      return {
        score: `${percent}%`,
        feedback: validated.data.feedback,
        weakTopics: state.weakTopics.length > 0 ? state.weakTopics : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Final report LLM call failed; using fallback summary', { error: message });
      return this.fallbackReport(state);
    }
  }

  private fallbackReport(state: ExamState): ExamFinalReport {
    const total = Math.max(1, state.totalQuestions);
    const maxScore = total * 3;
    const midThreshold = Math.ceil(maxScore * examFallbackMidScoreFraction);
    const percent = Math.round((state.score / maxScore) * 100);

    let fallbackLevel: 'perfect' | 'mid' | 'low' = 'low';
    if (state.score >= maxScore) {
      fallbackLevel = 'perfect';
    } else if (state.score >= midThreshold) {
      fallbackLevel = 'mid';
    }

    return {
      score: `${percent}%`,
      feedback: '', // Will be localized in presentation layer
      isFallback: true,
      fallbackLevel,
      weakTopics: state.weakTopics.length > 0 ? state.weakTopics : undefined,
    };
  }
}

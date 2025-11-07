import { injectable, inject } from 'tsyringe';
import { Prisma, ExamStatus as PrismaExamStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { env } from '../../config/env';
import { AppEdition } from '../../config/app-edition.enum';
import { ExamStatus } from '../../domain/exam/examStatus';

import type { IExamPipelineRepository } from '../../application/ports/examPipelineRepository.port';
import {
  CreateProcessingExamDenyReason,
  type IExamSessionRepository,
  type IRecentExamData,
  type CreateProcessingExamResult,
} from '../../application/ports/examSessionRepository.port';

@injectable()
export class PrismaExamRepository implements IExamPipelineRepository, IExamSessionRepository {
  constructor(
    @inject('PrismaClient') private readonly db: PrismaClient,
    @inject('MAX_EXAMS_PER_USER') private readonly maxExamsPerUserLimit: number
  ) {}

  async verifySubscriptionAndCreateProcessingExam(userId: bigint): Promise<CreateProcessingExamResult> {
    const examId = await this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (env.appEdition !== AppEdition.COMMUNITY) {
        if (!user?.subscriptionEndDate || user.subscriptionEndDate < new Date()) {
          return null;
        }
      }

      await tx.transaction.create({
        data: {
          userId,
          amount: 0,
          reason: 'EXAM_START',
        },
      });

      // Clean up old exams to prevent unbounded growth
      const userExams = await tx.exam.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (userExams.length >= this.maxExamsPerUserLimit) {
        const examsToDelete = userExams.slice(this.maxExamsPerUserLimit - 1).map((e) => e.id);

        await tx.exam.deleteMany({
          where: {
            id: { in: examsToDelete },
          },
        });
      }

      const exam = await tx.exam.create({
        data: {
          userId,
          status: PrismaExamStatus.PROCESSING,
        },
        select: { id: true },
      });

      return exam.id;
    });

    if (examId === null) {
      return { ok: false, reason: CreateProcessingExamDenyReason.NO_ACTIVE_SUBSCRIPTION };
    }

    return { ok: true, examId };
  }

  async findExamPipelineRow(examId: string): Promise<{ status: ExamStatus } | null> {
    const row = await this.db.exam.findUnique({
      where: { id: examId },
      select: { status: true },
    });
    if (!row) {
      return null;
    }
    return { status: row.status as unknown as ExamStatus };
  }

  async saveKnowledgeMapAndMarkReady(examId: string, payload: unknown): Promise<void> {
    await this.db.exam.update({
      where: { id: examId },
      data: {
        knowledgeMap: payload as Prisma.InputJsonValue,
        status: PrismaExamStatus.READY,
      },
    });
  }

  async refundExamCreditAndMarkError(examId: string, userId: bigint): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const updated = await tx.exam.updateMany({
        where: {
          id: examId,
          userId,
          status: PrismaExamStatus.PROCESSING,
        },
        data: { status: PrismaExamStatus.ERROR },
      });
      if (updated.count === 1) {
        await tx.transaction.create({
          data: {
            userId,
            amount: 0,
            reason: 'REFUND_ERROR',
          },
        });
      }
    });
  }

  async findReadyKnowledgeJson(examId: string, userId: bigint): Promise<unknown | null> {
    const exam = await this.db.exam.findFirst({
      where: {
        id: examId,
        userId,
        status: PrismaExamStatus.READY,
      },
      select: { knowledgeMap: true },
    });
    return exam?.knowledgeMap ?? null;
  }

  async completeExam(params: {
    examId: string;
    userId: bigint;
    score: number;
    maxScore: number;
    feedback: string;
  }): Promise<void> {
    const result = await this.db.exam.updateMany({
      where: {
        id: params.examId,
        userId: params.userId,
        status: PrismaExamStatus.READY,
      },
      data: {
        status: PrismaExamStatus.COMPLETED,
        score: params.score,
        maxScore: params.maxScore,
        feedback: params.feedback,
        knowledgeMap: Prisma.DbNull,
      },
    });
    if (result.count !== 1) {
      throw new Error('Exam row not updated (missing, wrong user, or already completed)');
    }
  }

  async getRecentCompletedExams(userId: bigint, limit: number): Promise<IRecentExamData[]> {
    return this.db.exam.findMany({
      where: {
        userId,
        status: PrismaExamStatus.COMPLETED,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      select: {
        id: true,
        score: true,
        maxScore: true,
        feedback: true,
        createdAt: true,
      },
    });
  }
}

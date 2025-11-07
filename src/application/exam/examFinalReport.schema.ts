import { z } from 'zod';

export const examFinalReportLlmSchema = z.object({
  feedback: z.string(),
});

export type ExamFinalReport = {
  score: string;
  feedback: string;
  isFallback?: boolean;
  fallbackLevel?: 'perfect' | 'mid' | 'low';
  weakTopics?: string[];
};

import { z } from 'zod';

const storedKnowledgePayloadSchema = z.object({
  knowledgeMap: z.object({
    topics: z.array(
      z.object({
        name: z.string(),
        facts: z.array(z.string()),
      })
    ),
  }),
  questionBank: z.array(
    z.object({
      id: z.string(),
      topic: z.string(),
      question: z.string(),
      idealAnswer: z.string(),
      difficulty: z.coerce.number().int().min(1).max(3),
    })
  ),
});

export type StoredKnowledgePayload = z.infer<typeof storedKnowledgePayloadSchema>;

export function parseKnowledgeMapPayload(json: unknown): StoredKnowledgePayload | null {
  const result = storedKnowledgePayloadSchema.safeParse(json);
  return result.success ? result.data : null;
}

export const materialAnalysisSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string(),
      facts: z.array(z.string()),
    })
  ),
});

export type MaterialAnalysis = z.infer<typeof materialAnalysisSchema>;

const questionBankItemFromLlmSchema = z.object({
  id: z.string(),
  topic: z.string(),
  question: z.string(),
  ideal_answer: z.string(),
  difficulty: z.coerce.number().int().min(1).max(3),
});

export const questionBankEnvelopeSchema = z
  .object({
    questions: z.array(questionBankItemFromLlmSchema),
  })
  .transform((raw) => ({
    questions: raw.questions.map((question) => ({
      id: question.id,
      topic: question.topic,
      question: question.question,
      idealAnswer: question.ideal_answer,
      difficulty: question.difficulty,
    })),
  }));

export type ExamQuestion = z.infer<typeof questionBankEnvelopeSchema>['questions'][number];

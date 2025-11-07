import { injectable, inject } from 'tsyringe';
import { z } from 'zod';

import { examAnswerEvaluationLlm } from '../../config/llm.constants';
import type { ILlmClient } from '../ports/llmClient.port';
import type { IAppLogger } from '../ports/logger.port';
import type { IExamPromptBuilderService } from '../ports/examPromptBuilder.port';

const verdictSchema = z.object({
  score: z.number(),
  needsFollowUp: z.boolean().default(false),
});

export type ExamEvaluation = {
  readonly score: number;
  readonly needsFollowUp: boolean;
  readonly feedback: string;
};

export type ExamEvaluationOutcome = { ok: true; evaluation: ExamEvaluation } | { ok: false; errorMessage: string };

export type EvaluateExamAnswerOptions = {
  readonly onFeedbackChunk?: (chunk: string) => void | Promise<void>;
};

const verdictOpenTag = '<verdict>';
const verdictCloseTag = '</verdict>';

function parseVerdictBlock(fullText: string): { feedback: string; verdictJson: string } {
  const openIdx = fullText.indexOf(verdictOpenTag);
  if (openIdx === -1) {
    // Fallback: try to find a JSON-like structure at the end of the text
    const jsonMatch = fullText.match(/\{[\s\S]*"score"[\s\S]*"needsFollowUp"[\s\S]*\}/);
    if (jsonMatch) {
      const verdictJson = jsonMatch[0];
      const feedback = fullText
        .replace(verdictJson, '')
        .replace(/```json|```/g, '')
        .trim();
      return { feedback, verdictJson };
    }

    // If no JSON is found, fallback to assuming it's all feedback and requires follow-up
    return {
      feedback: fullText.replace(/```json|```/g, '').trim(),
      verdictJson: '{"score": 0, "needsFollowUp": true}',
    };
  }
  const jsonStart = openIdx + verdictOpenTag.length;
  const closeIdx = fullText.indexOf(verdictCloseTag, jsonStart);
  if (closeIdx === -1) {
    // If opening tag exists but closing tag is missing, try to parse from opening tag to the end
    const rawJson = fullText
      .slice(jsonStart)
      .replace(/```json|```/g, '')
      .trim();
    const feedback = fullText.slice(0, openIdx).trim();
    return { feedback, verdictJson: rawJson || '{"score": 0, "needsFollowUp": true}' };
  }
  const verdictJson = fullText.slice(jsonStart, closeIdx).trim();
  const feedback = fullText.slice(0, openIdx).trim();
  return { feedback, verdictJson };
}

@injectable()
export class EvaluateExamAnswerUseCase {
  constructor(
    @inject('IAppLogger') private readonly logger: IAppLogger,
    @inject('ILlmClient') private readonly llm: ILlmClient,
    @inject('IExamPromptBuilderService') private readonly promptBuilder: IExamPromptBuilderService
  ) {}

  /**
   * Streams graded feedback (plain text), then parses machine-readable verdict from `<verdict>...</verdict>`.
   */
  async execute(
    params: {
      question: string;
      idealAnswer: string;
      userAnswer: string;
      currentQuestionHistory?: { role: 'user' | 'assistant'; content: string }[];
    },
    options?: EvaluateExamAnswerOptions
  ): Promise<ExamEvaluationOutcome> {
    try {
      let buffer = '';
      let feedbackEmittedThrough = 0;

      const messages = this.promptBuilder.buildEvaluationMessages(params);

      const stream = this.llm.streamChatCompletion(messages, examAnswerEvaluationLlm);

      for await (const delta of stream) {
        buffer += delta;

        const verdictStart = buffer.indexOf(verdictOpenTag);
        const feedbackCap = verdictStart === -1 ? buffer.length : verdictStart;
        if (feedbackCap > feedbackEmittedThrough) {
          const slice = buffer.slice(feedbackEmittedThrough, feedbackCap);
          feedbackEmittedThrough = feedbackCap;
          if (slice.length > 0 && options?.onFeedbackChunk) {
            await options.onFeedbackChunk(slice);
          }
        }
      }

      const parsed = parseVerdictBlock(buffer);

      let verdictUnknown: unknown;
      try {
        verdictUnknown = JSON.parse(parsed.verdictJson) as unknown;
      } catch (err) {
        this.logger.warn('Exam evaluation LLM verdict JSON parse failed, using fallback', {
          error: err instanceof Error ? err.message : String(err),
          verdictJson: parsed.verdictJson,
        });
        verdictUnknown = { score: 0, needsFollowUp: true };
      }

      let validated = verdictSchema.safeParse(verdictUnknown);
      if (!validated.success) {
        this.logger.warn('Exam evaluation LLM verdict shape unexpected, using fallback', {
          issueCount: validated.error.issues.length,
        });
        validated = { success: true, data: { score: 0, needsFollowUp: true } };
      }

      const evaluation: ExamEvaluation = {
        score: validated.data.score,
        needsFollowUp: validated.data.needsFollowUp,
        feedback: parsed.feedback || '...', // Ensure feedback is not completely empty
      };

      return { ok: true, evaluation };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Exam answer grading LLM call failed', { error: message });
      return { ok: false, errorMessage: message };
    }
  }
}

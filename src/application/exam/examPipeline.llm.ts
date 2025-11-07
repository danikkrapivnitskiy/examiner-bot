import type { z } from 'zod';

import { examPipelineJsonLlmFirstAttempt, examPipelineJsonLlmRepairAttempt } from '../../config/llm.constants';
import {
  KnowledgeMapEmptyError,
  LlmStructuredOutputError,
  QuestionBankEmptyError,
} from '../../domain/errors/examinerPipeline.errors';
import type { ILlmClient, LlmChatMessage } from '../ports/llmClient.port';
import type { IAppLogger } from '../ports/logger.port';
import { ANALYZE_MATERIAL_SYSTEM_PROMPT, QUESTION_BANK_SYSTEM_PROMPT } from '../prompts/systemPrompts';
import {
  materialAnalysisSchema,
  questionBankEnvelopeSchema,
  type MaterialAnalysis,
  type ExamQuestion,
} from './examKnowledge.schema';

function stripCodeFences(raw: string): string {
  let trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/u, '');
  }
  return trimmed.trim();
}

function safeParseJson(content: string): unknown {
  const stripped = stripCodeFences(content);
  return JSON.parse(stripped) as unknown;
}

async function callLlmJson<T>(params: {
  client: ILlmClient;
  messages: readonly LlmChatMessage[];
  /** Supports pipelines with `.transform()` (LLM wire shape differs from parsed output). */
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  label: string;
  logger: IAppLogger;
}): Promise<T> {
  const { client, messages, schema, label, logger } = params;

  const first = await client.generateChatCompletion([...messages], {
    ...examPipelineJsonLlmFirstAttempt,
    jsonMode: true,
  });

  const tryParse = (raw: string): T | null => {
    try {
      const data = safeParseJson(raw);
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        logger.warn('Zod schema validation failed', { error: parsed.error });
      }
      return parsed.success ? parsed.data : null;
    } catch (e) {
      logger.warn('JSON parse error', { error: e });
      return null;
    }
  };

  const okFirst = tryParse(first.content);
  if (okFirst) {
    return okFirst;
  }

  logger.warn('LLM JSON parse failed; retrying with repair prompt', { label, rawContent: first.content });

  const repairMessages: LlmChatMessage[] = [
    ...messages,
    {
      role: 'assistant',
      content: first.content,
    },
    {
      role: 'user',
      content:
        'Your previous reply was not valid JSON for the requested schema. Reply again with ONLY valid JSON and no markdown fences.',
    },
  ];

  const second = await client.generateChatCompletion(repairMessages, {
    ...examPipelineJsonLlmRepairAttempt,
    jsonMode: true,
  });

  const okSecond = tryParse(second.content);
  if (!okSecond) {
    throw new LlmStructuredOutputError(label);
  }

  return okSecond;
}

export async function analyzeEntireMaterialWithLlm(
  client: ILlmClient,
  logger: IAppLogger,
  text: string
): Promise<MaterialAnalysis> {
  return callLlmJson({
    client,
    schema: materialAnalysisSchema,
    label: `analyze_entire_material`,
    logger,
    messages: [
      { role: 'system', content: ANALYZE_MATERIAL_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
  });
}

export async function generateExamQuestionBankWithLlm(
  client: ILlmClient,
  logger: IAppLogger,
  knowledgeMap: { topics: { name: string; facts: string[] }[] },
  maxQuestions: number
): Promise<ExamQuestion[]> {
  const envelope = await callLlmJson({
    client,
    schema: questionBankEnvelopeSchema,
    label: 'questionBank',
    logger,
    messages: [
      { role: 'system', content: QUESTION_BANK_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Target number of questions: ${maxQuestions}\n\nKnowledge map JSON:\n${JSON.stringify({ topics: knowledgeMap.topics })}`,
      },
    ],
  });

  return envelope.questions;
}

export function ensureKnowledgeMapHasTopics(knowledgeMap: { topics: { name: string; facts: string[] }[] }): void {
  if (knowledgeMap.topics.length === 0) {
    throw new KnowledgeMapEmptyError();
  }
}

export function ensureQuestionBankNonEmpty(questions: readonly ExamQuestion[]): void {
  if (questions.length === 0) {
    throw new QuestionBankEmptyError();
  }
}

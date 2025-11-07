/* eslint-disable @typescript-eslint/naming-convention */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Loads markdown prompts synchronously at module init (startup).
 * Paths are resolved next to this file so loading works for both `src/` (ts-node) and `dist/` (`npm start`)
 * regardless of `process.cwd()`, provided `npm run build` copies `*.prompt.md` into `dist/application/prompts/`.
 */
function loadPromptMd(filename: string): string {
  const absolutePath = path.resolve(__dirname, filename);
  try {
    return fs.readFileSync(absolutePath, 'utf8').replaceAll('\r\n', '\n').trimEnd();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load examiner prompt "${filename}" at ${absolutePath}: ${detail}`);
  }
}

export const ANALYZE_MATERIAL_SYSTEM_PROMPT = loadPromptMd('analyze-material.prompt.md');
export const QUESTION_BANK_SYSTEM_PROMPT = loadPromptMd('generate-question-bank.prompt.md');
export const EVALUATE_ANSWER_SYSTEM_PROMPT = loadPromptMd('evaluate-answer.prompt.md');
export const generateFinalReportSystemPrompt = loadPromptMd('generate-final-report.prompt.md');

export function buildEvaluateAnswerSystemPrompt(): string {
  return EVALUATE_ANSWER_SYSTEM_PROMPT;
}

export function buildGenerateFinalReportSystemPrompt(): string {
  return generateFinalReportSystemPrompt;
}

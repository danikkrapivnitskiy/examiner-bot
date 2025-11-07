import type { ExamState } from '../../domain/exam/examState.entity';

import type { ExamQuestion } from './examKnowledge.schema';

function shuffleInPlace<T>(items: T[]): void {
  for (let upperIndex = items.length - 1; upperIndex > 0; upperIndex -= 1) {
    const swapIndex = Math.floor(Math.random() * (upperIndex + 1));
    const tmp = items[upperIndex];
    items[upperIndex] = items[swapIndex];
    items[swapIndex] = tmp;
  }
}

/**
 * Builds a shuffled pool of question IDs capped by configuration and bank size.
 */
export function buildQuestionPool(params: {
  questions: readonly Pick<ExamQuestion, 'id'>[];
  maxQuestions: number;
}): string[] {
  const { maxQuestions } = params;
  const ids = params.questions.map((question) => question.id);
  const copy = [...ids];
  shuffleInPlace(copy);
  const take = Math.min(maxQuestions, copy.length);
  return copy.slice(0, take);
}

export function buildInitialExamState(params: { examId: string; questionPoolIds: string[] }): ExamState | null {
  const { examId, questionPoolIds } = params;
  if (questionPoolIds.length === 0) {
    return null;
  }

  return {
    examId,
    currentIndex: 0,
    score: 0,
    weakTopics: [],
    askedQuestionIds: [],
    totalQuestions: questionPoolIds.length,
    questionPoolIds,
  };
}

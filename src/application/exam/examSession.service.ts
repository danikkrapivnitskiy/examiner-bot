import { injectable } from 'tsyringe';
import type { ExamState } from '../../domain/exam/examState.entity';
import type { ExamEvaluation } from '../useCases/evaluateExamAnswer.useCase';

export type ExamAnswerResult = {
  isExamFinished: boolean;
  nextQuestionIndex: number;
  weakTopicAdded?: string;
  needsFollowUp: boolean;
};

@injectable()
export class ExamSessionService {
  public processAnswer(state: ExamState, evaluation: ExamEvaluation, topic: string): ExamAnswerResult {
    let isExamFinished = false;
    let weakTopicAdded: string | undefined = undefined;

    if (evaluation.needsFollowUp) {
      // The LLM asked a follow-up question or gave a hint.
      // We don't advance the question index.
    } else {
      // The question is fully resolved.
      state.score += evaluation.score;

      if (evaluation.score < 2) {
        state.weakTopics.push(topic);
        weakTopicAdded = topic;
      }

      state.currentIndex += 1;
      state.currentQuestionHistory = [];
    }

    if (state.currentIndex >= state.totalQuestions) {
      isExamFinished = true;
    }

    return {
      isExamFinished,
      nextQuestionIndex: state.currentIndex,
      weakTopicAdded,
      needsFollowUp: evaluation.needsFollowUp,
    };
  }
}

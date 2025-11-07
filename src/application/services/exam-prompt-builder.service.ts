import { injectable } from 'tsyringe';
import { MAX_HISTORY_MESSAGES } from '../../config/exam.constants';
import { buildEvaluateAnswerSystemPrompt } from '../prompts/systemPrompts';
import type { IExamPromptBuilderService, ChatMessage } from '../ports/examPromptBuilder.port';

@injectable()
export class ExamPromptBuilderService implements IExamPromptBuilderService {
  public buildEvaluationMessages(params: {
    question: string;
    idealAnswer: string;
    userAnswer: string;
    currentQuestionHistory?: ChatMessage[];
  }): ChatMessage[] {
    const system = buildEvaluateAnswerSystemPrompt();
    const messages: ChatMessage[] = [{ role: 'system', content: system }];

    if (params.currentQuestionHistory && params.currentQuestionHistory.length > 0) {
      // Initial question context
      messages.push({
        role: 'user',
        content: `Question: ${params.question}\nIdeal Answer: ${params.idealAnswer}`,
      });

      // Sliding window memory
      const recentHistory = params.currentQuestionHistory.slice(-MAX_HISTORY_MESSAGES);

      messages.push(...recentHistory);
      // Latest user answer
      messages.push({ role: 'user', content: params.userAnswer });
    } else {
      // First time asking this question
      messages.push({
        role: 'user',
        content: `Question: ${params.question}\nIdeal Answer: ${params.idealAnswer}\n\nStudent Answer: ${params.userAnswer}`,
      });
    }

    return messages;
  }
}

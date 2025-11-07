export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface IExamPromptBuilderService {
  buildEvaluationMessages(params: {
    question: string;
    idealAnswer: string;
    userAnswer: string;
    currentQuestionHistory?: ChatMessage[];
  }): ChatMessage[];
}

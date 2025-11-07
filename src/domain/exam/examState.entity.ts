/**
 * Redis-backed state for an active exam session (Step 4–6).
 */
export interface ExamState {
  examId: string;
  /** Index into {@link ExamState.questionPoolIds}. */
  currentIndex: number;
  score: number;
  weakTopics: string[];
  askedQuestionIds: string[];
  totalQuestions: number;
  /**
   * Ordered question IDs for this session (subset of the stored question bank).
   * Required to resolve the current question across updates.
   */
  questionPoolIds: string[];
  /**
   * Chat history for the current question (used for follow-up questions).
   */
  currentQuestionHistory?: { role: 'user' | 'assistant'; content: string }[];
  /**
   * ID of the message with the latest exam inline keyboard to remove it on the next user message.
   */
  lastQuestionMessageId?: number;
}

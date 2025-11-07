export interface IDailyStatistics {
  date: string;
  newUsers: number;
  activeUsers: number;
  referralsCount: number;
  examsCompleted: number;
  questionsAnswered: number;
  paymentsOpened: number;
  purchases: {
    count: number;
    amountsByCurrency: Record<string, number>;
  };
  topUsers: Array<{
    userId: number;
    username?: string;
    examsCount: number;
  }>;
  openai?: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
  };
  grok?: {
    balance: number;
  };
  errors: {
    total: number;
    critical: number;
    warnings: number;
    byType: Array<{ type: string; count: number }>;
  };
}

export interface IStatisticsService {
  trackPaymentOpened(userId: number): Promise<void>;
  trackExamCompleted(userId: number): Promise<void>;
  trackQuestionAnswered(userId: number): Promise<void>;
  trackPurchase(userId: number, amount: number, currency: string, reason: string): Promise<void>;
  trackTopUser(userId: number, scoreIncrement: number): Promise<void>;
  trackActiveUser(userId: number): Promise<void>;
  getDailyStatistics(date?: Date): Promise<IDailyStatistics>;
}

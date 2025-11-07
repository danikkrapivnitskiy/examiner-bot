export interface IErrorSample {
  name: string;
  message: string;
  code?: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

export interface IStatisticsRepository {
  incrementPaymentsOpened(timestamp?: number): Promise<void>;
  getPaymentsOpened(startTimestamp: number, endTimestamp: number): Promise<number>;

  incrementExamsCompleted(timestamp?: number): Promise<void>;
  getExamsCompleted(startTimestamp: number, endTimestamp: number): Promise<number>;

  incrementQuestionsAnswered(timestamp?: number): Promise<void>;
  getQuestionsAnswered(startTimestamp: number, endTimestamp: number): Promise<number>;

  incrementErrorCount(errorType: string, isCritical?: boolean): Promise<void>;
  getErrorCounts(
    startTimestamp: number,
    endTimestamp: number
  ): Promise<{
    total: number;
    critical: number;
    warnings: number;
    byType: Array<{ type: string; count: number }>;
  }>;

  addErrorSample(sample: IErrorSample): Promise<void>;
  getErrorSamples(startTimestamp: number, endTimestamp: number, limit: number): Promise<IErrorSample[]>;

  updateTopUsers(userId: number, scoreIncrement: number, timestamp?: number): Promise<void>;
  getTopUsers(
    startTimestamp: number,
    endTimestamp: number,
    limit?: number
  ): Promise<Array<{ userId: number; score: number }>>;

  recordActiveUser(userId: number, timestamp?: number): Promise<void>;
  getActiveUsers(startTimestamp: number, endTimestamp: number): Promise<number>;
}

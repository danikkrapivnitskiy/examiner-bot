export enum QuotaType {
  EXAMS_GENERATED = 'exams_generated',
  AUDIO_SECONDS = 'audio_seconds',
  TUTOR_MESSAGES = 'tutor_messages',
}

export interface IQuotaUsage {
  readonly examsGenerated: number;
  readonly audioSeconds: number;
  readonly tutorMessages: number;
}

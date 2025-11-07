/**
 * Represents all available bot commands.
 */
export enum BotCommand {
  START = 'start',
  INFO = 'info',
  REF = 'referral',
  CHAT_ID = 'chatid',
  ID = 'id',
  ADMIN = 'admin',
  LANGUAGE = 'language',
  START_EXAM = 'start_exam',
  BALANCE = 'balance',
  STATISTICS = 'statistics',
  PAYMENTS = 'payments',
}

/**
 * Represents callback query actions used in inline keyboards.
 */
export enum CallbackAction {
  SET_LANGUAGE = 'lang',
  ADMIN_ADD_EXAMS = 'admin:add_exams',
  OPEN_PAYMENTS_MENU = 'cmd:payments',
  OPEN_REFERRAL_MENU = 'cmd:referral',
  PROMPT_START_EXAM = 'cmd:start_exam',
}

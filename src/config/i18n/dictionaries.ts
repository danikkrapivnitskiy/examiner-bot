import type { ExaminerUiLocale } from './locale';

/**
 * User-facing Telegram copy and small formatters for examiner-bot (en / ru).
 * Code identifiers stay in English per project standards.
 */
export interface IExaminerMessages {
  /** Generic fallback when a handler throws (middleware catch-all). */
  readonly unexpectedHandlerError: string;
  /** Short label for callback alerts when the full message exceeds Telegram limits. */
  readonly handlerErrorAlertFallback: string;
  /** Sliding-window rate limit exceeded; `retryAfter` is whole seconds until the user can retry. */
  readonly rateLimitExceeded: (retryAfter: number) => string;
  readonly startExamError: string;
  readonly documentUploadError: string;
  readonly processingAnswerError: string;
  readonly voiceMessageTooLong: string;
  readonly speechRecognitionFailed: string;
  readonly genericPipelineError: string;
  readonly unsupportedMaterial: string;
  readonly scannedDocumentError: string;
  readonly userProfileUnavailable: string;
  readonly couldNotResolveFile: string;
  readonly couldNotResolveChat: string;
  readonly insufficientExamCredits: string;
  readonly examGenerationNotConfigured: string;
  readonly analyzingMaterials: string;
  readonly gradingFailedShort: string;
  readonly nextQuestionMissing: string;
  readonly answerCheckingUnavailable: string;
  readonly examStateCorrupted: string;
  readonly invalidExamAction: string;
  readonly profileNotReadyCallback: string;
  readonly startingExam: string;
  readonly materialReadyLine1: string;
  readonly materialReadyLine2: string;
  readonly startExamButton: string;
  readonly nextQuestionButton: string;
  readonly startNewExamButton: string;
  readonly examNotAvailable: string;
  readonly noQuestionsFound: string;
  readonly emptyQuestionPool: string;
  readonly couldNotLoadFirstQuestion: string;
  readonly materialNoLongerAvailable: string;
  readonly couldNotReadQuestions: string;
  readonly couldNotLoadCurrentQuestion: string;
  readonly examCompleteSaveFailedLine1: string;
  readonly examCompleteSaveFailedLine2: string;
  readonly examCompleteHeader: string;
  readonly examReportIsBeingPrepared: string;
  readonly scoreLabel: string;
  readonly topicsToReviewLabel: string;
  readonly fallbackRecoPerfect: string;
  readonly fallbackRecoMid: string;
  readonly fallbackRecoLow: string;
  readonly fileTooLargeMb: (mb: number) => string;
  readonly documentTooManyTokens: (estimatedTokens: number, limit: number) => string;
  readonly welcomeExamBalance: (balance: number) => string;
  readonly referralLinkMessage: (
    botName: string,
    referralCode: string,
    bonusDays: number,
    friendBonusDays: number
  ) => string;
  readonly referralShareButton: string;
  readonly questionLine: (questionNumber: number, totalQuestions: number, questionText: string) => string;
  readonly examCompleteSaveFailedMessage: (reportBody: string) => string;
  readonly examCompleteReportBody: (report: { score: string; feedback: string }) => string;
  readonly examStatisticsBody: (report: { feedback: string }) => string;

  // Command messages
  readonly commandChatId: (chatId: string, userId: string) => string;
  readonly commandStartWelcome: string;
  readonly commandStartMenuInfo: string;
  readonly commandStartMenuLanguage: string;
  readonly commandStartMenuStartExam: string;
  readonly commandInfo: (
    voiceLimitMins: number,
    fileSizeMb: number,
    maxQuestions: number,
    supportUsername: string,
    dailyExamsLimit: number,
    dailyMessagesLimit: number
  ) => string;
  readonly commandStartExam: string;
  readonly commandLanguageChoose: string;
  readonly commandLanguageChanged: string;
  readonly commandBalance: (subscriptionEndDate: Date | null | undefined) => string;
  readonly commandStatisticsEmpty: string;
  readonly commandStatisticsTitle: string;
  readonly commandStatisticsItem: (
    index: number,
    date: string,
    score: number,
    maxScore: number,
    feedback: string
  ) => string;
  readonly commandStatisticsMoreExams: (hiddenCount: number) => string;
  readonly commandAdminMenu: string;
  readonly commandAdminAddExamsBtn: string;
  readonly commandAdminAddExamsPrompt: string;
  readonly commandAdminUnauthorized: string;
  readonly commandAddExamsSuccess: (amount: number, userId: string) => string;
  readonly commandAddExamsError: string;
  readonly processingInProgress: string;

  // Payment messages
  readonly commandPaymentsTitle: string;
  readonly commandPaymentsDescription: string;
  readonly commandPaymentsPayEur: (price: number) => string;
  readonly commandPaymentsPayCzk: (price: number) => string;
  readonly paymentUnavailable: string;
  readonly paymentLinkReady: string;
  readonly paymentLinkButton: string;
  readonly paymentMenuButton: string;
  readonly referralMenuButton: string;
  readonly paymentError: string;
  readonly paymentSuccess: (amount: number) => string;
  readonly dailyExamsLimitReached: string;
  readonly dailyTutorLimitReached: string;
  readonly dailyAudioLimitReached: string;
  readonly textMessageTooLong: string;
  readonly voiceDisabledInCommunity: string;
  readonly accessDeniedCommunity: string;
}

export const examinerMessagesEn: IExaminerMessages = {
  unexpectedHandlerError: 'Sorry, an unexpected error occurred. Please try again.',
  handlerErrorAlertFallback: 'Something went wrong. Please try again.',
  rateLimitExceeded: (retryAfter: number): string => `Too many requests. Please try again in ${retryAfter} seconds.`,
  startExamError: 'Something went wrong while starting the exam. Please wait a moment and try again.',
  documentUploadError: 'Something went wrong while handling your file. Please try again later.',
  processingAnswerError: 'Something went wrong while processing your answer. Please try again.',
  voiceMessageTooLong: 'Voice message is too long. Maximum duration is 1 minute.',
  speechRecognitionFailed: 'Failed to recognize speech.',
  genericPipelineError:
    'Unfortunately, I could not analyze this document. Please try uploading a different file (PDF, DOCX, or TXT) or try again a bit later.',
  unsupportedMaterial: 'This file type is not supported yet. Please upload a PDF, DOCX, or plain text (.txt) file.',
  scannedDocumentError:
    'This appears to be a scanned document without a text layer. Please use a file with selectable text or run it through an OCR tool first.',
  userProfileUnavailable: 'User profile is not available. Please try /start again.',
  couldNotResolveFile: 'Could not resolve this file on Telegram. Please try again.',
  couldNotResolveChat: 'Could not resolve the chat for this update. Please try again in a private chat.',
  insufficientExamCredits: 'Your AI Examiner Premium subscription has expired.',
  examGenerationNotConfigured: 'Exam generation is temporarily unavailable. Please contact support.',
  analyzingMaterials: 'Studying your materials... 📚 This might take a couple of minutes, please wait.',
  gradingFailedShort: "Couldn't grade that answer automatically. Try again shortly.",
  nextQuestionMissing: 'Could not load the next question. Please start the exam again.',
  answerCheckingUnavailable: 'Answer checking is temporarily unavailable. Please contact support.',
  examStateCorrupted: 'Your exam session is in a bad state. Please start a new exam from your material.',
  invalidExamAction: 'Invalid exam action. Please try again from the material ready message.',
  profileNotReadyCallback: 'Your profile is not ready. Use /start and try again.',
  startingExam: 'Starting exam...',
  materialReadyLine1: 'Your material is ready.',
  materialReadyLine2:
    'Tap the button below when you want to begin the exam.\n💡 You can always skip a question using the "Next Question" button.',
  startExamButton: 'Start exam',
  nextQuestionButton: 'Next Question',
  startNewExamButton: '🚀 Start new exam',
  examNotAvailable:
    'This exam is not available. The file may still be processing, or it does not belong to your account.',
  noQuestionsFound: 'No questions were found for this material. Please upload the document again or contact support.',
  emptyQuestionPool: 'Could not start the exam because the question pool is empty.',
  couldNotLoadFirstQuestion: 'Could not load the first question. Please try starting the exam again.',
  materialNoLongerAvailable: 'This exam material is no longer available. Upload the file again to start over.',
  couldNotReadQuestions: 'Could not read questions for this material. Please upload the document again.',
  couldNotLoadCurrentQuestion: 'Could not load the current question. Please start the exam again.',
  examCompleteSaveFailedLine1: 'Your exam is complete, but we could not save the results right now.',
  examCompleteSaveFailedLine2: 'If this keeps happening, please contact support.',
  examCompleteHeader: '🏁 Exam complete!',
  examReportIsBeingPrepared: '⏳ Your exam is complete. Please wait a few seconds while I prepare your final report...',
  scoreLabel: 'Final score:',
  topicsToReviewLabel: 'Topics to review:',
  fallbackRecoPerfect:
    'Outstanding work on this attempt. Briefly revisit any weak topics when you have time so the ideas stick.',
  fallbackRecoMid:
    'Nice progress. Spend a short session on the topics to review, then try another round when you feel ready.',
  fallbackRecoLow:
    'Every attempt builds skill. Focus on the topics to review with short study bursts, then come back for another exam.',
  fileTooLargeMb: (mb: number): string => `This file is too large. Maximum allowed size is ${mb} MB.`,
  documentTooManyTokens: (estimatedTokens: number, limit: number): string =>
    `This document is too large to analyze. It contains roughly ${estimatedTokens} tokens, but the limit is ${limit}. Please upload a shorter document.`,
  welcomeExamBalance: (balance: number): string =>
    `Welcome. You have ${balance} exam credit${balance === 1 ? '' : 's'} remaining.`,
  referralLinkMessage: (botName: string, referralCode: string, bonusDays: number, friendBonusDays: number): string =>
    `Invite friends to get +${bonusDays} bonus day${bonusDays === 1 ? '' : 's'} of AI Examiner Premium!\nYour friend will get ${friendBonusDays} bonus days of Premium instead of 1.\n\nYour referral link (tap to copy):\n<code>https://t.me/${botName}?start=${referralCode}</code>`,
  referralShareButton: 'Share with friends',
  questionLine: (questionNumber: number, totalQuestions: number, questionText: string): string =>
    `Question ${questionNumber}/${totalQuestions}: ${questionText}`,
  examCompleteSaveFailedMessage: (reportBody: string): string =>
    [
      examinerMessagesEn.examCompleteSaveFailedLine1,
      examinerMessagesEn.examCompleteSaveFailedLine2,
      '',
      reportBody,
    ].join('\n'),
  examCompleteReportBody: (report): string =>
    [
      `<b>${examinerMessagesEn.examCompleteHeader}</b>`,
      '',
      `<b>${examinerMessagesEn.scoreLabel}</b> ${report.score}`,
      '',
      report.feedback,
    ].join('\n'),
  examStatisticsBody: (report): string => report.feedback,

  commandChatId: (chatId: string, userId: string): string => `Chat ID: ${chatId}\nUser ID: ${userId}`,
  commandStartWelcome: [
    'Welcome to <b>AI Examiner</b>! 🎓',
    '',
    'I will help you prepare for your exams. Just send me your study notes or lectures, and I will test your knowledge based on those materials.',
    '',
    'Ready to start?',
    '',
    '🎁 <i>Want bonus Premium days? Click /referral</i>',
  ].join('\n'),
  commandStartMenuInfo: 'ℹ️ Info',
  commandStartMenuLanguage: '🌐 Language',
  commandStartMenuStartExam: '🚀 Start Exam',
  commandInfo: (
    voiceLimitMins: number,
    fileSizeMb: number,
    maxQuestions: number,
    supportUsername: string,
    dailyExamsLimit: number,
    dailyMessagesLimit: number
  ): string =>
    [
      '<b>How to use AI Examiner:</b>',
      '1. Send a file (PDF, DOCX, or TXT) with your study materials.',
      '2. I will ask questions, and you answer (text or voice).',
      '3. If your answer is incomplete, we will discuss the topic until you understand it.',
      '💡 <i>You can skip the question using the "Next Question" button.</i>',
      '',
      '💎 <b>AI Examiner Subscription</b>',
      `⏳ Up to ${dailyExamsLimit} exams and ${dailyMessagesLimit} tutor messages per day`,
      `🎙 Up to ${voiceLimitMins} minute${voiceLimitMins === 1 ? '' : 's'} of voice chat per day`,
      `📄 Analyze files up to ${fileSizeMb}MB (about 50-80 pages)`,
      `🎯 ${maxQuestions} questions per exam for thorough testing`,
      '🌍 Multilingual support: tests in any language',
      '🛜 24/7 access, practice day and night',
      '🧠 Smart algorithm remembers your weak topics',
      '💸 1-week plan is cheaper than 1 hour with a human tutor',
      '',
      '❗️ <b>Note:</b> The bot analyzes text only. Images and scans without recognized text are ignored.',
      '',
      '🤖 <b>Bot Commands:</b>',
      '/start — Main menu',
      '/info — Info',
      '/balance — Subscription status',
      '/payments — Buy Premium',
      '/referral — Get bonus days',
      '',
      `📞 <b>Support:</b> ${supportUsername}`,
    ].join('\n'),
  commandStartExam: 'Send a file (PDF, DOCX, or TXT) to start an exam.',
  commandLanguageChoose: 'Choose your language',
  commandLanguageChanged: 'Language changed successfully.',
  commandBalance: (subscriptionEndDate: Date | null | undefined): string => {
    if (!subscriptionEndDate || subscriptionEndDate < new Date()) {
      return `Subscription is inactive 😔`;
    }
    const formattedDate = subscriptionEndDate.toLocaleString('en-US', {
      timeZone: 'Europe/Prague',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    return `Subscription is active until ${formattedDate} (Prague time)`;
  },
  commandStatisticsEmpty: 'You have not completed any exams yet.',
  commandStatisticsTitle: 'Your recent exams:',
  commandStatisticsItem: (index: number, date: string, score: number, maxScore: number, feedback: string): string => {
    const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    return `*${index}. Date: ${date}*\nScore: ${percent}%\n${feedback}`;
  },
  commandStatisticsMoreExams: (hiddenCount: number): string =>
    `\n*...and ${hiddenCount} more exam${hiddenCount === 1 ? '' : 's'}*`,
  commandAdminMenu: 'Admin Menu:',
  commandAdminAddExamsBtn: 'Add Subscription Days',
  commandAdminAddExamsPrompt:
    'Send the ID of the user and the amount of days to add, separated by a space. Example: 123456789 5',
  commandAdminUnauthorized: 'Unauthorized',
  commandAddExamsSuccess: (amount: number, userId: string): string =>
    `Successfully added ${amount} days to user ${userId}.`,
  commandAddExamsError: 'Error adding exams. Ensure the user exists and amount is a number.',
  processingInProgress: 'Please wait, your previous message is still being processed...',

  commandPaymentsTitle: 'Select a currency to purchase a 7-day AI Examiner Premium subscription.',
  commandPaymentsDescription:
    'Payment will be processed securely via Stripe.\nMore info: https://stripe.com/en-cz/payments',
  commandPaymentsPayEur: (price: number): string => `€${price}`,
  commandPaymentsPayCzk: (price: number): string => `${price} Kč`,
  paymentUnavailable: 'Payments are currently unavailable.',
  paymentLinkReady: 'Your payment link is ready. Click the button below to proceed to the secure Stripe checkout:',
  paymentLinkButton: '💳 Proceed to Payment',
  paymentMenuButton: '💳 Get Premium',
  referralMenuButton: '🎁 Get bonus days',
  paymentError: 'An error occurred while creating the payment session.',
  paymentSuccess: (amount: number): string =>
    `✅ Payment successful! Your AI Examiner Premium subscription has been extended by ${amount} days.`,
  dailyExamsLimitReached: 'You have reached your daily limit for generating exams. Please try again tomorrow.',
  dailyTutorLimitReached: 'You have reached your daily limit for tutor messages. Please come back tomorrow!',
  dailyAudioLimitReached: 'You have reached your daily limit for voice messages. Please use text instead.',
  textMessageTooLong: 'Your message is too long. Please keep it shorter to help me understand you better.',
  voiceDisabledInCommunity:
    'Voice messages are disabled in the community version of the bot. Please send a text message.',
  accessDeniedCommunity: 'Sorry, this bot is operating in a private closed mode for approved users only.',
};

export const examinerMessagesRu: IExaminerMessages = {
  unexpectedHandlerError: 'Произошла непредвиденная ошибка. Попробуйте ещё раз.',
  handlerErrorAlertFallback: 'Что-то пошло не так. Попробуйте ещё раз.',
  rateLimitExceeded: (retryAfter: number): string =>
    `Слишком много запросов. Пожалуйста, подождите ${retryAfter} секунд.`,
  startExamError: 'Не удалось начать экзамен. Подождите немного и попробуйте ещё раз.',
  documentUploadError: 'При обработке файла что-то пошло не так. Попробуйте позже.',
  processingAnswerError: 'При обработке ответа что-то пошло не так. Попробуйте ещё раз.',
  voiceMessageTooLong: 'Голосовое сообщение слишком длинное. Максимум — 1 минута.',
  speechRecognitionFailed: 'Не удалось распознать речь.',
  genericPipelineError:
    'К сожалению, мне не удалось проанализировать этот документ. Попробуйте загрузить другой файл (PDF, DOCX или TXT) или вернитесь немного позже.',
  unsupportedMaterial: 'Этот тип файла пока не поддерживается. Загрузите PDF, DOCX или обычный текстовый файл (.txt).',
  scannedDocumentError:
    'Похоже, это отсканированный документ без текстового слоя. Пожалуйста, загрузите файл с выделяемым текстом или предварительно распознайте его (OCR).',
  userProfileUnavailable: 'Профиль пользователя недоступен. Введите /start ещё раз.',
  couldNotResolveFile: 'Не удалось получить файл в Telegram. Попробуйте ещё раз.',
  couldNotResolveChat: 'Не удалось определить чат для этого сообщения. Попробуйте в личном чате.',
  insufficientExamCredits: 'Срок действия вашей Premium-подписки истек.',
  examGenerationNotConfigured: 'Функция создания экзаменов временно недоступна. Пожалуйста, обратитесь в поддержку.',
  analyzingMaterials: 'Изучаю ваши материалы… 📚 Это может занять пару минут, пожалуйста, подождите.',
  gradingFailedShort: 'Не удалось автоматически оценить ответ. Попробуйте чуть позже.',
  nextQuestionMissing: 'Не удалось загрузить следующий вопрос. Начните экзамен заново.',
  answerCheckingUnavailable: 'Проверка ответов временно недоступна. Пожалуйста, обратитесь в поддержку.',
  examStateCorrupted: 'Сессия экзамена повреждена. Начните новый экзамен из вашего материала.',
  invalidExamAction: 'Неверное действие. Повторите из сообщения о готовности материала.',
  profileNotReadyCallback: 'Профиль не готов. Введите /start и попробуйте снова.',
  startingExam: 'Запускаем экзамен…',
  materialReadyLine1: 'Материал готов.',
  materialReadyLine2:
    'Нажмите кнопку ниже, когда хотите начать экзамен.\n💡 Любой вопрос можно пропустить кнопкой "Понятно, следующий вопрос".',
  startExamButton: 'Начать экзамен',
  nextQuestionButton: 'Понятно, следующий вопрос',
  startNewExamButton: '🚀 Начать новый экзамен',
  examNotAvailable: 'Экзамен недоступен. Файл может ещё обрабатываться или не принадлежит вашему аккаунту.',
  noQuestionsFound: 'Для этого материала не найдено вопросов. Загрузите документ снова или свяжитесь с поддержкой.',
  emptyQuestionPool: 'Не удалось начать экзамен: пул вопросов пуст.',
  couldNotLoadFirstQuestion: 'Не удалось загрузить первый вопрос. Попробуйте начать экзамен снова.',
  materialNoLongerAvailable: 'Материал экзамена больше недоступен. Загрузите файл снова, чтобы начать заново.',
  couldNotReadQuestions: 'Не удалось прочитать вопросы для этого материала. Загрузите документ снова.',
  couldNotLoadCurrentQuestion: 'Не удалось загрузить текущий вопрос. Начните экзамен заново.',
  examCompleteSaveFailedLine1: 'Экзамен завершён, но сейчас не удалось сохранить результаты.',
  examCompleteSaveFailedLine2: 'Если это повторяется, свяжитесь с поддержкой.',
  examCompleteHeader: '🏁 Экзамен завершён!',
  examReportIsBeingPrepared: '⏳ Экзамен завершен. Ваш итоговый отчет готовится, подождите несколько секунд...',
  scoreLabel: 'Итоговый балл:',
  topicsToReviewLabel: 'Темы для повторения:',
  fallbackRecoPerfect:
    'Отличная работа в этой попытке. При случае коротко повторите слабые темы, чтобы лучше запомнить материал.',
  fallbackRecoMid:
    'Хороший прогресс. Уделите немного времени темам для повторения, затем попробуйте снова, когда будете готовы.',
  fallbackRecoLow:
    'Каждая попытка делает вас сильнее. Сфокусируйтесь на темах для повторения короткими сессиями, затем вернитесь к экзамену.',
  fileTooLargeMb: (mb: number): string => `Файл слишком большой. Максимальный размер — ${mb} МБ.`,
  documentTooManyTokens: (estimatedTokens: number, limit: number): string =>
    `Этот документ слишком большой для анализа. В нём примерно ${estimatedTokens} токенов, а лимит составляет ${limit}. Пожалуйста, загрузите документ поменьше.`,
  welcomeExamBalance: (balance: number): string => `Добро пожаловать. Доступно попыток экзамена: ${balance}.`,
  referralLinkMessage: (botName: string, referralCode: string, bonusDays: number, friendBonusDays: number): string =>
    `Приглашайте друзей и получайте +${bonusDays} ${bonusDays === 1 ? 'день' : 'дней'} Premium-подписки бонусом!\nВаш друг получит ${friendBonusDays} дня Premium-доступа бонусом вместо 1.\n\nВаша реферальная ссылка (нажмите чтобы скопировать):\n<code>https://t.me/${botName}?start=${referralCode}</code>`,
  referralShareButton: 'Поделиться с друзьями',
  questionLine: (questionNumber: number, totalQuestions: number, questionText: string): string =>
    `Вопрос ${questionNumber}/${totalQuestions}: ${questionText}`,
  examCompleteSaveFailedMessage: (reportBody: string): string =>
    [
      examinerMessagesRu.examCompleteSaveFailedLine1,
      examinerMessagesRu.examCompleteSaveFailedLine2,
      '',
      reportBody,
    ].join('\n'),
  examCompleteReportBody: (report): string =>
    [
      `<b>${examinerMessagesRu.examCompleteHeader}</b>`,
      '',
      `<b>${examinerMessagesRu.scoreLabel}</b> ${report.score}`,
      '',
      report.feedback,
    ].join('\n'),
  examStatisticsBody: (report): string => report.feedback,

  commandChatId: (chatId: string, userId: string): string => `ID чата: ${chatId}\nID пользователя: ${userId}`,
  commandStartWelcome: [
    'Добро пожаловать в <b>AI Examiner</b>! 🎓',
    '',
    'Я помогу вам подготовиться к экзаменам. Просто отправьте мне свои конспекты или лекции, и я проведу опрос по этим материалам.',
    '',
    'Готовы начать?',
    '',
    '🎁 <i>Хотите бонусные дни Premium? Жмите /referral</i>',
  ].join('\n'),
  commandStartMenuInfo: 'ℹ️ Инфо',
  commandStartMenuLanguage: '🌐 Язык',
  commandStartMenuStartExam: '🚀 Начать экзамен',
  commandInfo: (
    voiceLimitMins: number,
    fileSizeMb: number,
    maxQuestions: number,
    supportUsername: string,
    dailyExamsLimit: number,
    dailyMessagesLimit: number
  ): string =>
    [
      '<b>Как использовать AI Examiner:</b>',
      '1. Отправьте файл (PDF, DOCX или TXT) с лекциями.',
      '2. Я задам вопросы по тексту, а вы ответите (текстом или голосом).',
      '3. Если ответ неполный, мы обсудим тему, пока вы ее не поймете.',
      '💡 <i>Вопрос можно пропустить с помощью кнопки "Понятно, следующий вопрос".</i>',
      '',
      '💎 <b>Подписка AI Examiner</b>',
      `⏳ До ${dailyExamsLimit} экзаменов и ${dailyMessagesLimit} сообщений с репетитором в день`,
      `🎙 До ${voiceLimitMins} минут${voiceLimitMins === 1 ? 'ы' : ''} голосовых ответов в день`,
      `📄 Анализ файлов до ${fileSizeMb} МБ (около 50-80 страниц)`,
      `🎯 По ${maxQuestions} вопросов в каждом экзамене`,
      '🌍 Мультиязычность: поддержка любых языков',
      '🛜 Доступ 24/7, тренируйтесь днем и ночью',
      '🧠 Умный алгоритм запоминает ваши слабые темы',
      '💸 Неделя безлимитной подготовки дешевле 1 часа с живым репетитором',
      '',
      '❗️ <b>Важно:</b> Бот анализирует только текст. Картинки и сканы без распознанного текста игнорируются.',
      '',
      '🤖 <b>Команды бота:</b>',
      '/start — Главное меню',
      '/info — Инфо',
      '/balance — Статус подписки',
      '/payments — Купить Premium',
      '/referral — Бонусные дни',
      '',
      `📞 <b>Поддержка:</b> ${supportUsername}`,
    ].join('\n'),
  commandStartExam: 'Отправьте файл (PDF, DOCX или TXT), чтобы начать экзамен.',
  commandLanguageChoose: 'Выберите язык',
  commandLanguageChanged: 'Язык успешно изменен.',
  commandBalance: (subscriptionEndDate: Date | null | undefined): string => {
    if (!subscriptionEndDate || subscriptionEndDate < new Date()) {
      return `Подписка неактивна 😔`;
    }
    const formattedDate = subscriptionEndDate.toLocaleString('ru-RU', {
      timeZone: 'Europe/Prague',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    return `Подписка активна до ${formattedDate} (Прага)`;
  },
  commandStatisticsEmpty: 'Вы еще не сдали ни одного экзамена.',
  commandStatisticsTitle: 'Ваши последние экзамены:',
  commandStatisticsItem: (index: number, date: string, score: number, maxScore: number, feedback: string): string => {
    const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    return `*${index}. Дата: ${date}*\nОценка: ${percent}%\n${feedback}`;
  },
  commandStatisticsMoreExams: (hiddenCount: number): string => {
    const lastDigit = hiddenCount % 10;
    const lastTwoDigits = hiddenCount % 100;
    let word = 'экзаменов';
    if (lastDigit === 1 && lastTwoDigits !== 11) {
      word = 'экзамен';
    } else if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
      word = 'экзамена';
    }
    return `\n*...и еще ${hiddenCount} ${word}*`;
  },
  commandAdminMenu: 'Меню администратора:',
  commandAdminAddExamsBtn: 'Добавить дни подписки',
  commandAdminAddExamsPrompt: 'Отправьте ID пользователя и количество дней через пробел. Пример: 123456789 5',
  commandAdminUnauthorized: 'Нет доступа',
  commandAddExamsSuccess: (amount: number, userId: string): string =>
    `Успешно добавлено ${amount} дней подписки пользователю ${userId}.`,
  commandAddExamsError: 'Ошибка. Убедитесь, что пользователь существует, а количество — число.',
  processingInProgress: 'Подождите, ваше предыдущее сообщение еще обрабатывается...',

  commandPaymentsTitle: 'Выберите валюту для покупки 7 дней Premium-подписки.',
  commandPaymentsDescription:
    'Оплата будет произведена через систему Stripe.\nПодробнее: https://stripe.com/en-cz/payments',
  commandPaymentsPayEur: (price: number): string => `€${price}`,
  commandPaymentsPayCzk: (price: number): string => `${price} Kč`,
  paymentUnavailable: 'Оплата временно недоступна.',
  paymentLinkReady: 'Ваша ссылка на оплату готова. Нажмите кнопку ниже, чтобы перейти на защищенную страницу Stripe:',
  paymentLinkButton: '💳 Перейти к оплате',
  paymentMenuButton: '💳 Купить Premium',
  referralMenuButton: '🎁 Бонусные дни',
  paymentError: 'Произошла ошибка при создании платежа.',
  paymentSuccess: (amount: number): string =>
    `✅ Оплата прошла успешно! Ваша Premium-подписка продлена на ${amount} дней.`,
  dailyExamsLimitReached: 'Вы достигли дневного лимита на создание экзаменов. Пожалуйста, попробуйте завтра.',
  dailyTutorLimitReached: 'Вы достигли дневного лимита на обсуждение вопросов с репетитором. Возвращайтесь завтра!',
  dailyAudioLimitReached:
    'Вы достигли дневного лимита на голосовые сообщения. Пожалуйста, используйте текстовые сообщения.',
  textMessageTooLong:
    'Ваше сообщение слишком длинное. Пожалуйста, сформулируйте мысль короче, чтобы я мог лучше вас понять.',
  voiceDisabledInCommunity: 'В бесплатной версии бота голосовые сообщения отключены. Пожалуйста, пишите текстом.',
  accessDeniedCommunity: 'Извините, этот бот работает в закрытом приватном режиме только для одобренных пользователей.',
};

const byLocale: Record<ExaminerUiLocale, IExaminerMessages> = {
  en: examinerMessagesEn,
  ru: examinerMessagesRu,
};

export function getExaminerMessages(locale: ExaminerUiLocale): IExaminerMessages {
  return byLocale[locale];
}

export type ExaminerMessageStringKey = {
  [K in keyof IExaminerMessages]: IExaminerMessages[K] extends string ? K : never;
}[keyof IExaminerMessages];

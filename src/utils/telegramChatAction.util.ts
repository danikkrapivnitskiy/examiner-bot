import type { Context } from 'grammy';
import type { IAppLogger } from '../application/ports/logger.port';

/**
 * Wraps an asynchronous action with a continuous Telegram 'typing' chat action.
 * Ensures the typing status remains active during long-running tasks (like LLM streaming)
 * and is safely cleared when the task completes or fails.
 */
export async function withTypingAction<T>(ctx: Context, logger: IAppLogger, action: () => Promise<T>): Promise<T> {
  const chatId = ctx.chat?.id;

  // If there's no chat ID, we can't send chat actions, just execute the action
  if (!chatId) {
    return action();
  }

  // Send the initial typing action immediately
  await ctx.api.sendChatAction(chatId, 'typing').catch(() => {
    // Ignore initial failure, it's not critical
  });

  // Telegram clears chat actions after 5 seconds, so we refresh it every 4 seconds
  const intervalId = setInterval(() => {
    ctx.api.sendChatAction(chatId, 'typing').catch((err) => {
      logger.warn('Failed to send typing action', { error: String(err) });
    });
  }, 4000);

  try {
    // Execute the actual long-running task
    return await action();
  } finally {
    // Guarantee the interval is cleared regardless of success or failure
    clearInterval(intervalId);
  }
}

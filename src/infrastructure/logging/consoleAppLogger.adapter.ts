import type { IAppLogger } from '../../application/ports/logger.port';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export function createConsoleAppLogger(configuredLevel: LogLevel, isProduction: boolean): IAppLogger {
  function shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] <= LEVEL_ORDER[configuredLevel];
  }

  function formatLog(level: LogLevel, message: string, data?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();

    if (!isProduction) {
      const color =
        {
          error: '\x1b[31m', // red
          warn: '\x1b[33m', // yellow
          info: '\x1b[36m', // cyan
          debug: '\x1b[90m', // gray
        }[level] ?? '';
      const reset = '\x1b[0m';
      const contextColor = '\x1b[90m'; // gray for context

      const timeStr = new Date(timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      });

      let output = `${color}[${timeStr}] ${level.toUpperCase()}${reset} ${message}`;
      if (data !== undefined && Object.keys(data).length > 0) {
        const dataStr = JSON.stringify(data, null, 2);
        output += `\n${contextColor}${dataStr}${reset}`;
      }
      return output;
    }

    return JSON.stringify({ level, message, ...data, ts: timestamp });
  }

  return {
    error(message: string, data?: Record<string, unknown>): void {
      if (!shouldLog('error')) {
        return;
      }
      // eslint-disable-next-line no-console
      console.error(formatLog('error', message, data));
    },

    warn(message: string, data?: Record<string, unknown>): void {
      if (!shouldLog('warn')) {
        return;
      }
      // eslint-disable-next-line no-console
      console.warn(formatLog('warn', message, data));
    },

    info(message: string, data?: Record<string, unknown>): void {
      if (!shouldLog('info')) {
        return;
      }
      // eslint-disable-next-line no-console
      console.log(formatLog('info', message, data));
    },

    debug(message: string, data?: Record<string, unknown>): void {
      if (!shouldLog('debug')) {
        return;
      }
      // eslint-disable-next-line no-console
      console.log(formatLog('debug', message, data));
    },
  };
}

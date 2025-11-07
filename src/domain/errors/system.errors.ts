import { BaseError } from './base.error';

export class TempDirectoryFullError extends BaseError {
  constructor(message = 'Temporary directory size limit exceeded. Please try again later.') {
    super(message, 'TEMP_DIR_FULL', 503);
  }

  getUserMessage(): string {
    return 'The system is currently busy processing other files. Please try again in a few minutes.';
  }
}

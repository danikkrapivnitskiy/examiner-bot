import { BaseError } from './base.error';

export class UnsupportedMaterialError extends BaseError {
  constructor(message: string) {
    super(message, 'UNSUPPORTED_MATERIAL', 400);
  }

  getUserMessage(): string {
    return this.message;
  }

  shouldReportToSlack(): boolean {
    return false; // User error
  }
}

export class EmptyExtractedTextError extends BaseError {
  constructor(message = 'No readable text could be extracted from this file.') {
    super(message, 'EMPTY_EXTRACTED_TEXT', 400);
  }

  getUserMessage(): string {
    return this.message;
  }

  shouldReportToSlack(): boolean {
    return false; // User error
  }
}

export class MaterialTooLargeTokensError extends BaseError {
  constructor(
    public readonly estimatedTokens: number,
    public readonly limit: number
  ) {
    super(`Material exceeds token limit: ${estimatedTokens} > ${limit}`, 'MATERIAL_TOO_LARGE_TOKENS', 400);
  }

  getUserMessage(): string {
    return this.message;
  }

  shouldReportToSlack(): boolean {
    return false; // User error
  }
}

export class ScannedDocumentError extends BaseError {
  constructor(message = 'This appears to be a scanned document without a text layer.') {
    super(message, 'SCANNED_DOCUMENT', 400);
  }

  getUserMessage(): string {
    return this.message;
  }

  shouldReportToSlack(): boolean {
    return false; // User error
  }
}

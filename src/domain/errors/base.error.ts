/**
 * Base error class for all application errors
 * Provides a common structure and behavior for error handling
 */
export abstract class BaseError extends Error {
  /**
   * Timestamp when the error occurred
   */
  public readonly timestamp: Date;

  /**
   * Additional context information
   */
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON format
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
    };
  }

  /**
   * Get user-friendly error message
   */
  abstract getUserMessage(): string;

  /**
   * Determine if this error should be reported to Slack
   * User errors (insufficient credits, invalid input) return false
   * System errors (network, API, internal) return true
   * Override in subclasses to customize behavior
   */
  shouldReportToSlack(): boolean {
    // Default: report all errors to Slack
    // Subclasses can override to prevent reporting user errors
    return true;
  }
}

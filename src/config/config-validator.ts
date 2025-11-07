/**
 * Standalone configuration validator
 * Does NOT import config.ts to avoid triggering config loading
 * Safe for use in deployment scripts
 */

import { envSchema } from './schemas/env.schema';

/**
 * Validates configuration without loading it
 * Useful for deployment scripts and testing
 * @returns Validation result with errors if invalid
 */
export function validateConfig(): { valid: true } | { valid: false; errors: Array<{ path: string; message: string }> } {
  const result = envSchema.safeParse(process.env);

  if (result.success) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: result.error.errors.map((err) => ({
      path: err.path.join('.'),
      message: err.message,
    })),
  };
}

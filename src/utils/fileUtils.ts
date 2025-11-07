import fs from 'node:fs/promises';
import path from 'node:path';

import { IAppLogger } from '../application/ports/logger.port';

const bytesPerMb = 1024 * 1024;
const bytesPerKb = 1024;
const minutesPerHour = 60;
const secondsPerMinute = 60;
const millisecondsPerSecond = 1000;

/**
 * Ensure directory exists, create if it doesn't
 */
export async function ensureDir(dirPath: string, logger?: IAppLogger): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    logger?.error('Failed to create directory', {
      dirPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Delete file with error handling
 */
export async function deleteFile(filePath: string, logger?: IAppLogger): Promise<void> {
  try {
    await fs.unlink(filePath);
    logger?.debug('File deleted', { filePath });
  } catch (error) {
    // Don't throw error if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger?.warn('Failed to delete file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Delete multiple files
 */
export async function deleteFiles(filePaths: string[], logger?: IAppLogger): Promise<void> {
  await Promise.allSettled(filePaths.map((path) => deleteFile(path, logger)));
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string, logger?: IAppLogger): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    logger?.error('Failed to get file size', {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Generate unique temporary file path
 */
export function getTempFilePath(extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  // Ensure extension starts with a dot
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const filename = `${timestamp}-${random}${ext}`;
  return path.join(process.cwd(), 'tmp', filename);
}

/**
 * Clean up old temporary files (older than specified hours)
 */
export async function cleanupTempFiles(maxAgeHours: number = 24, logger?: IAppLogger): Promise<void> {
  try {
    const tmpDir = path.join(process.cwd(), 'tmp');

    try {
      await fs.access(tmpDir);
    } catch {
      await ensureDir(tmpDir, logger);
      return;
    }

    const files = await fs.readdir(tmpDir);
    const now = Date.now();
    const maxAge = maxAgeHours * minutesPerHour * secondsPerMinute * millisecondsPerSecond;

    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(tmpDir, file);

      try {
        const stats = await fs.stat(filePath);

        if (stats.isDirectory()) {
          continue;
        }

        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      } catch (error) {
        logger?.warn('Failed to process temp file', {
          file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (deletedCount > 0) {
      logger?.info('Cleaned up temporary files', { deletedCount, maxAgeHours });
    }
  } catch (error) {
    logger?.error('Failed to cleanup temp files', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Get file extension from path
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase().slice(1);
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= bytesPerKb && unitIndex < units.length - 1) {
    size /= bytesPerKb;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Check if temporary directory size is within safe limits
 * Prevents disk overflow attacks by monitoring tmp directory size
 * @param maxSizeMB - Maximum allowed size in MB (default: 500MB)
 * @returns true if within limits, false if exceeded
 */
export async function checkTempDirectoryLimit(maxSizeMB: number = 500, logger?: IAppLogger): Promise<boolean> {
  try {
    const currentSizeMB = await getTempDirectorySizeMB(logger);

    if (currentSizeMB > maxSizeMB) {
      logger?.warn('Temporary directory size limit exceeded', {
        currentSizeMB: currentSizeMB.toFixed(2),
        maxSizeMB,
        tmpDir: path.join(process.cwd(), 'tmp'),
      });
      return false;
    }

    return true;
  } catch (error) {
    logger?.error('Failed to check temp directory limit', {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/**
 * Get total size of temporary directory in MB
 * @returns Total size in MB
 */
export async function getTempDirectorySizeMB(logger?: IAppLogger): Promise<number> {
  try {
    const tmpDir = path.join(process.cwd(), 'tmp');

    try {
      await fs.access(tmpDir);
    } catch {
      return 0;
    }

    const files = await fs.readdir(tmpDir);
    let totalSize = 0;

    for (const file of files) {
      const filePath = path.join(tmpDir, file);

      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
      } catch {
        // Skip files we can't access
      }
    }

    return totalSize / bytesPerMb;
  } catch (error) {
    logger?.error('Failed to calculate temp directory size', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

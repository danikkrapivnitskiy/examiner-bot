import { injectable, inject } from 'tsyringe';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IFileStorage } from '../../application/ports/fileStorage.port';
import type { IAppLogger } from '../../application/ports/logger.port';
import { ensureDir, deleteFiles, checkTempDirectoryLimit } from '../../utils/fileUtils';

@injectable()
export class LocalFileStorage implements IFileStorage {
  constructor(@inject('IAppLogger') private readonly logger: IAppLogger) {}

  async createTempFilePath(originalName: string): Promise<string> {
    const tmpDir = path.join(process.cwd(), 'tmp');
    await ensureDir(tmpDir, this.logger);
    return path.join(tmpDir, `${randomUUID()}-${originalName}`);
  }

  async deleteFile(filePath: string): Promise<void> {
    await fs.unlink(filePath).catch(() => {
      // Ignore errors on delete (e.g. file not found)
    });
  }

  async deleteFiles(paths: string[]): Promise<void> {
    await deleteFiles(paths, this.logger);
  }

  async getFileSizeInBytes(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  async checkTempDirectoryLimit(maxSizeMB: number = 500): Promise<boolean> {
    return checkTempDirectoryLimit(maxSizeMB, this.logger);
  }
}

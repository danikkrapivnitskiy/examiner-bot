export interface IFileStorage {
  /**
   * Returns a unique temporary file path on disk where a file can be written.
   */
  createTempFilePath(originalName: string): Promise<string>;

  /**
   * Deletes the file at the given path. Does not throw if the file does not exist.
   */
  deleteFile(path: string): Promise<void>;

  /**
   * Returns the size of the file in bytes.
   */
  getFileSizeInBytes(path: string): Promise<number>;

  /**
   * Deletes multiple files. Does not throw if files do not exist.
   */
  deleteFiles(paths: string[]): Promise<void>;

  /**
   * Checks if the temporary directory size is within safe limits.
   * @param maxSizeMB Maximum allowed size in MB
   */
  checkTempDirectoryLimit(maxSizeMB?: number): Promise<boolean>;
}

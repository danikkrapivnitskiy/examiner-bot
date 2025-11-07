export interface IFileDownloader {
  /**
   * Returns the file as a Buffer (in memory).
   */
  downloadFile(fileId: string): Promise<Buffer>;

  /**
   * Downloads the file directly to the given destination path on disk.
   */
  downloadToDisk(fileId: string, destPath: string): Promise<void>;
}

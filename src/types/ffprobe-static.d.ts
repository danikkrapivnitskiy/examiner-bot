declare module 'ffprobe-static' {
  /** Resolved path to the ffprobe binary bundled by ffprobe-static. */
  interface FfprobeInstaller {
    readonly path: string;
  }

  const installer: FfprobeInstaller;
  export default installer;
}

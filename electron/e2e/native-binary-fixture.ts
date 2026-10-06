import { resolve } from 'node:path';

/** Fixture generation uses the same source build as the development app. */
export const nativeFixtureBinary = (tool: 'ffmpeg' | 'ffprobe') =>
  resolve(
    __dirname,
    '../.native-tools',
    `${process.platform}-${process.arch}`,
    tool + (process.platform === 'win32' ? '.exe' : ''),
  );

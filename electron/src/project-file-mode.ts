/** Windows chmod exposes read-only/write state, not POSIX execute or group bits. */
export function projectFileModeMatches(
  actual: number,
  expected: number,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const mask = platform === 'win32' ? 0o200 : 0o777;
  return (actual & mask) === (expected & mask);
}

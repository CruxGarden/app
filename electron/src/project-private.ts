/** Host recovery state is never workspace content, regardless of .cruxignore. */
export function isPrivateProjectPath(relative: string): boolean {
  return relative
    .replace(/\\/g, '/')
    .split('/')
    .some((part) => part.toLowerCase() === '.crux-recovery');
}

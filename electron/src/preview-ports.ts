/** Pending and bound app preview ports. The kernel remains the final bind authority. */
const claims = new Map<number, object>();
export function claimPreviewPort(port: number, owner: object): boolean {
  if (claims.has(port) && claims.get(port) !== owner) return false;
  claims.set(port, owner);
  return true;
}
export function releasePreviewPort(port: number, owner: object): void {
  if (claims.get(port) === owner) claims.delete(port);
}
export function previewPortClaimed(port: number): boolean {
  return claims.has(port);
}

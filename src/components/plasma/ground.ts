/** The ground canvas — the one behind everything — for an overlay to sample. */
export const GROUND_CLASS = 'plasma-ground';
export function plasmaGround(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(`canvas.${GROUND_CLASS}`);
}

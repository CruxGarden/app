export function validateCommand(value: Record<string, unknown>): Record<string, unknown>;
export function inspectPixels(
  frame: { getPixel(x: number, y: number): number },
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number; palette: string[]; rows: number[][] };

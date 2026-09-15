export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** One-shot placement in Electron's display work area, in logical pixels. */
export function figmaLayout(area: WindowRect, side: 'left' | 'right' = 'left') {
  if (
    ![area.x, area.y, area.width, area.height].every(Number.isFinite) ||
    area.width < 1100 ||
    area.height < 600
  )
    throw new Error(
      'This display is too small for automatic placement. Arrange the windows manually.',
    );
  if (!['left', 'right'].includes(side)) throw new Error('Choose left or right.');
  const width = 420;
  const gap = 12;
  const garden = {
    x: side === 'left' ? area.x : area.x + area.width - width,
    y: area.y,
    width,
    height: area.height,
  };
  const figma = {
    x: side === 'left' ? area.x + width + gap : area.x,
    y: area.y,
    width: area.width - width - gap,
    height: area.height,
  };
  return { garden, figma };
}

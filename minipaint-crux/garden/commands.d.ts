export const FONTS: string[];
export function validateCommand(value: unknown): Record<string, unknown> & { op: string };
export function textData(
  text: string,
  style?: Record<string, unknown>,
): Array<Array<{ text: string; meta: Record<string, unknown> }>>;
export function reviseText(data: unknown, value: Record<string, unknown>): unknown;

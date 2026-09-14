export function validateCommand(value: Record<string, unknown>): Record<string, unknown>;
export function replaceSource(source: string, find: string, replacement: string): string;
export function summarizeCell(cell: unknown, index: number, sourceOffset?: number, sourceLimit?: number): unknown;

export const TYPES: string[];
export const EFFECTS: Record<string, { name: string; params: Record<string, number[]> }>;
export const SHAPES: string[];
export const PADS: string[];
export function validateProject(doc: unknown, expectedType?: string): any;
export function applyCommand(doc: any, command: Record<string, unknown>): any;
export function starter(type: string): any;
export function tableExample(name?: string): any;

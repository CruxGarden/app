export function validateProject(doc: unknown): void;
export function validateSchema(schema: unknown, depth?: number): void;
export function listFields(schema: unknown): { key: string; type: string; label: string; required: boolean }[];

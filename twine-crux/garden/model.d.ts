export function validateProject(doc: unknown): void;
export function validateState(doc: unknown): void;
export function installStorage(
	initial: unknown,
	changed: () => void
): () => Record<string, string>;

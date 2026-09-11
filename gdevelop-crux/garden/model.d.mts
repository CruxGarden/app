export function validateProject(document: unknown): void;
export function validateNativeDocument(document: unknown): void;
export function memoryStorage(initial?: Record<string, string>, changed?: () => void): {
  storage: Storage;
  snapshot(): Record<string, string>;
};

export function layoutHistory<T>(initial: T): { record(value: T): void; undo(): T | null; redo(): T | null; readonly canUndo: boolean; readonly canRedo: boolean };

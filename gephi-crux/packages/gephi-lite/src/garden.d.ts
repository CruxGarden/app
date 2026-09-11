interface Window {
  gardenGraph?: {
    initial: Record<string, string> | null;
    changed(): void;
    failed(error: Error): void;
    connect(api: {
      capture(): Record<string, string>;
      busy(): boolean;
      command(value: { op: string; title?: string }): unknown;
    }): void;
  };
}

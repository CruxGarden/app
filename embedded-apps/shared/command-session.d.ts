export function createCommandSession<Command>(callbacks: {
  settle(): void | Promise<void>;
  prepare(command: Command): {
    mutates: boolean;
    apply(): unknown | Promise<unknown>;
    result?(value: unknown): unknown | Promise<unknown>;
  };
  save(): void | Promise<void>;
}): { execute(command: Command): Promise<unknown> };

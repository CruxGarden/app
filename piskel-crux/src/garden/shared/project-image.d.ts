export function validateProjectImagePath(path: unknown): string;
export function loadProjectImage(
  path: string,
  baseUrl: string,
): Promise<{
  image: HTMLImageElement;
  release(): void;
}>;

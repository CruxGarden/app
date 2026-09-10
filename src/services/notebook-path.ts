export const NOTEBOOK_ROOT = 'notebook/';
export const isNotebookImage = (path: string) => /\.(png|jpe?g|gif|webp)$/i.test(path);
export function notebookPath(value: unknown): string {
  // Control characters are deliberately excluded from filesystem paths.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'string' || !value || value.length > 240 || /[\\:%?#\x00-\x1f]/.test(value))
    throw new Error('Choose a relative notebook path.');
  const parts = value.split('/');
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        (part.startsWith('.') && part !== '.assets' && part !== '.tigrana'),
    )
  )
    throw new Error('This path is outside the notebook.');
  const metadata = /(?:^|\/)\.tigrana\/(metadata|index|folder)\.json$/.test(value);
  if (parts.includes('.tigrana') && !metadata)
    throw new Error('Only Tigrana metadata files belong in .tigrana.');
  if (parts.includes('.assets') && !isNotebookImage(value))
    throw new Error('Only raster images belong in .assets.');
  if (!/\.md$/i.test(value) && value !== 'publish.json' && !isNotebookImage(value) && !metadata)
    throw new Error('The notebook accepts Markdown, raster images and Tigrana metadata.');
  return NOTEBOOK_ROOT + value;
}

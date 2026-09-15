/** Portable Figma identity. Never persist tracking parameters or credentials. */
export interface FigmaReference {
  url: string;
  fileKey: string;
  nodeId?: string;
}

export function parseFigmaReference(value: string): FigmaReference {
  if (typeof value !== 'string' || value.length > 2048)
    throw new Error('Paste a Figma file or frame link.');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Paste a Figma file or frame link.');
  }
  const parts = url.pathname.split('/');
  const kind = parts[1] ?? '';
  const fileKey = parts[2] ?? '';
  if (
    url.protocol !== 'https:' ||
    !['figma.com', 'www.figma.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !['design', 'file', 'board', 'slides'].includes(kind) ||
    !/^[a-zA-Z0-9]{6,128}$/.test(fileKey)
  )
    throw new Error('Use an https://www.figma.com design, file, board or slides link.');
  const rawNode = url.searchParams.get('node-id');
  if (rawNode && !/^\d+[:-]\d+$/.test(rawNode))
    throw new Error('The Figma frame link has an invalid node ID.');
  const nodeId = rawNode?.replace('-', ':');
  return {
    url: `https://www.figma.com/${kind}/${fileKey}${nodeId ? '?node-id=' + nodeId.replace(':', '-') : ''}`,
    fileKey,
    ...(nodeId ? { nodeId } : {}),
  };
}

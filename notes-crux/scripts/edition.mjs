import { splitNote } from '../src/note-file.ts';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, sep, posix } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

function safeRead(root, path) {
  if (
    typeof path !== 'string' ||
    /[\\\x00-\x1f:%?#]/.test(path) ||
    path.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.'))
  )
    throw new Error('Invalid notebook path.');
  const realRoot = realpathSync(root);
  const full = realpathSync(resolve(root, path));
  const rel = relative(realRoot, full);
  if (rel === '..' || rel.startsWith('..' + sep) || rel.startsWith(sep))
    throw new Error('Notebook file escapes its folder.');
  return readFileSync(full);
}
export function readEdition(folder, { allowEmpty = false } = {}) {
  const root = resolve(folder, 'notebook');
  const config = JSON.parse(safeRead(root, 'publish.json').toString('utf8'));
  if (
    typeof config.title !== 'string' ||
    !Array.isArray(config.pages) ||
    (!allowEmpty && !config.pages.length)
  )
    throw new Error('Select at least one note with “Include in public edition” before publishing.');
  const images = {};
  const pages = [...new Set(config.pages)].map((path) => {
    if (typeof path !== 'string' || !/\.md$/i.test(path))
      throw new Error('Public pages must be Markdown notes.');
    const markdown = splitNote(safeRead(root, path).toString('utf8')).body;
    const tree = unified().use(remarkParse).parse(markdown);
    const definitions = new Map();
    function scan(node, visit) {
      visit(node);
      for (const child of node.children ?? []) scan(child, visit);
    }
    scan(tree, (node) => {
      if (node.type === 'definition') definitions.set(node.identifier, node.url);
    });
    scan(tree, (node) => {
      const url =
        node.type === 'image'
          ? node.url
          : node.type === 'imageReference'
            ? definitions.get(node.identifier)
            : null;
      if (!url || /^[a-z]+:/i.test(url)) return;
      const target = posix.normalize(posix.join(posix.dirname(path), decodeURIComponent(url)));
      if (!/^assets\/[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(target))
        throw new Error(`Image in ${path} must be inside notebook/assets/.`);
      const bytes = safeRead(root, target);
      if (bytes.length > 5_000_000) throw new Error('Notebook images must be smaller than 5 MB.');
      const extension = target.split('.').pop().toLowerCase();
      const mime = extension === 'jpg' ? 'jpeg' : extension;
      images[target] = `data:image/${mime};base64,${bytes.toString('base64')}`;
    });
    return { path, markdown };
  });
  return { title: config.title, pages, images };
}

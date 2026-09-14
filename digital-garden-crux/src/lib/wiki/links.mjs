// The garden's link index (Crux Garden's addition to Veka): every note's
// outgoing links to other notes — [[wikilinks]] (with |alias and #heading)
// and Markdown links to /wiki/… — resolved the way the wikilink resolver
// resolves them (a basename maps to its path). Backlinks and the graph both
// read this; it is plain JavaScript so the fork's tests run without a build.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep, basename } from "node:path";

const isMarkdown = (file) => /\.(md|mdx)$/i.test(file);
const slugify = (name) => name.trim().replace(/ /g, "-").toLowerCase();

/** Every note under `root` as { id, title, growthStage, tags, body } — id is the path without extension. */
export function readNotes(root) {
  const notes = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (isMarkdown(entry.name)) {
        const id = relative(root, full).split(sep).join("/").replace(/\.(md|mdx)$/i, "");
        const source = readFileSync(full, "utf8");
        const { data, body } = splitFrontmatter(source);
        notes.push({
          id,
          title: data.title || basename(id),
          growthStage: data.growthStage || "seedling",
          tags: data.tags || [],
          body,
        });
      }
    }
  };
  walk(root);
  return notes.sort((a, b) => a.id.localeCompare(b.id));
}

/** A small frontmatter reader: title, growthStage and tags are all the index needs. */
export function splitFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) return { data: {}, body: source };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    let value = raw.trim();
    if (/^\[.*\]$/.test(value))
      value = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    else value = value.replace(/^["']|["']$/g, "");
    data[key] = value;
  }
  return { data, body: source.slice(match[0].length) };
}

/** basename (lowercase) → id, as wiki-link-resolver.mjs builds it. */
export function basenameMap(notes) {
  const map = new Map();
  for (const note of notes) map.set(basename(note.id).toLowerCase(), note.id);
  return map;
}

/** Resolve one link target (a wikilink name or a /wiki/ href) to a note id, or null. */
export function resolveTarget(target, byName, ids) {
  let name = target.trim();
  if (!name) return null;
  if (/^\/wiki(\/|$)/.test(name)) {
    const path = decodeURIComponent(name.replace(/^\/wiki\/?/, "").replace(/[#?].*$/, "").replace(/\/$/, ""));
    if (!path) return ids.has("index") ? "index" : null;
    return ids.has(path) ? path : (byName.get(basename(path).toLowerCase()) ?? null);
  }
  if (/^[a-z]+:/i.test(name) || name.startsWith("/") || name.startsWith("#")) return null;
  name = name.replace(/#.*$/, "");
  if (!name) return null;
  if (ids.has(name)) return name;
  return byName.get(slugify(basename(name))) ?? byName.get(basename(name).toLowerCase()) ?? null;
}

/** Outgoing links of one note body (deduplicated, in order of appearance). */
export function outgoingLinks(body, byName, ids) {
  const targets = new Set();
  const text = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  for (const m of text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const id = resolveTarget(m[1], byName, ids);
    if (id) targets.add(id);
  }
  for (const m of text.matchAll(/\]\((\/wiki[^)\s]*)\)/g)) {
    const id = resolveTarget(m[1], byName, ids);
    if (id) targets.add(id);
  }
  return [...targets];
}

/** The whole index: nodes and directed edges between notes. */
export function buildLinkIndex(notes) {
  const byName = basenameMap(notes);
  const ids = new Set(notes.map((n) => n.id));
  const edges = [];
  const outgoing = new Map();
  const incoming = new Map();
  for (const note of notes) {
    const targets = outgoingLinks(note.body, byName, ids).filter((t) => t !== note.id);
    outgoing.set(note.id, targets);
    for (const target of targets) {
      edges.push({ source: note.id, target });
      if (!incoming.has(target)) incoming.set(target, []);
      incoming.get(target).push(note.id);
    }
  }
  return {
    nodes: notes.map(({ id, title, growthStage, tags }) => ({
      id,
      title,
      growthStage,
      tags,
      links: (outgoing.get(id)?.length ?? 0) + (incoming.get(id)?.length ?? 0),
    })),
    edges,
    outgoing,
    incoming,
  };
}

/** Convenience for the site: read the folder and index it. */
export function indexGarden(root) {
  return buildLinkIndex(readNotes(root));
}

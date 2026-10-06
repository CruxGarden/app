/**
 * Add Crux asks one question — "What do you want to make?" — and the answer
 * picks where the Crux starts and what it is called, until the person says
 * otherwise (UX pass, 2026-09-27). No model is involved: the words of the
 * idea are matched against each starting point's own label, id and
 * description, plus a few everyday synonyms, so it works the same with AI
 * tools off.
 */

export interface StartingPointEntry {
  id: string;
  label: string;
  description: string;
}

/** Everyday words → words a starting point's own text is likely to use. */
const SYNONYMS: Record<string, string[]> = {
  website: ['site', 'homepage', 'page'],
  web: ['site', 'page'],
  landing: ['homepage', 'page', 'site'],
  portfolio: ['gallery', 'homepage', 'site'],
  photos: ['gallery', 'photo'],
  pictures: ['gallery', 'photo'],
  cv: ['resume'],
  shop: ['storefront', 'store'],
  store: ['storefront'],
  sell: ['storefront'],
  cooking: ['recipes', 'recipe'],
  recipe: ['recipes'],
  posts: ['blog'],
  journal: ['notes', 'notebook', 'blog'],
  diary: ['notes', 'notebook'],
  notebook: ['notes'],
  writing: ['notes', 'blog'],
  presentation: ['slides', 'deck'],
  deck: ['slides'],
  slideshow: ['slides'],
  spreadsheet: ['sheet', 'table', 'tables'],
  budget: ['sheet', 'table'],
  database: ['table', 'tables'],
  diagram: ['diagram', 'flowchart', 'whiteboard'],
  flowchart: ['diagram'],
  sketch: ['drawing', 'whiteboard', 'paint'],
  draw: ['drawing', 'whiteboard', 'paint'],
  drawing: ['whiteboard', 'paint'],
  painting: ['paint', 'raster'],
  wireframe: ['mockups', 'wireframes'],
  mockup: ['mockups', 'wireframes'],
  prototype: ['mockups', 'wireframes'],
  sprite: ['pixel'],
  pixel: ['sprite'],
  song: ['music', 'synth', 'sequencer', 'beat'],
  beat: ['music', 'sequencer', 'drum'],
  track: ['music', 'audio'],
  podcast: ['audio', 'recording'],
  sound: ['audio'],
  film: ['video'],
  movie: ['video'],
  clip: ['video'],
  story: ['interactive', 'twine'],
  adventure: ['interactive', 'game', 'twine'],
  platformer: ['game'],
  '3d': ['3d', 'model', 'scene'],
  model: ['3d', 'model'],
  world: ['map'],
  fantasy: ['map'],
  pdf: ['pdf'],
  form: ['form', 'forms'],
  survey: ['form', 'forms'],
  calendar: ['calendar', 'events'],
  schedule: ['calendar'],
  chart: ['chart', 'charts', 'visualization'],
  graph: ['chart', 'charts'],
  data: ['chart', 'charts', 'table'],
};

/** Words that say nothing about what kind of thing it is. */
const STOP = new Set(
  'a an the my our your of for about with and or to in on at by from that this it is be make build create start want would like me some little tiny small simple new i we app thing one'.split(
    ' ',
  ),
);

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);

/** The best starting point for an idea, or null when nothing says so (keep Blank). */
export function inferStartingPoint(
  idea: string,
  entries: readonly StartingPointEntry[],
): string | null {
  const said = words(idea).filter((w) => !STOP.has(w));
  if (!said.length) return null;
  const wanted = new Map<string, number>();
  for (const w of said) {
    wanted.set(w, Math.max(wanted.get(w) ?? 0, 2));
    // a plural or singular of the same word counts as the word
    if (w.endsWith('s')) wanted.set(w.slice(0, -1), Math.max(wanted.get(w.slice(0, -1)) ?? 0, 2));
    else wanted.set(`${w}s`, Math.max(wanted.get(`${w}s`) ?? 0, 2));
    for (const s of SYNONYMS[w] ?? []) wanted.set(s, Math.max(wanted.get(s) ?? 0, 1));
  }
  let best: { id: string; score: number } | null = null;
  for (const entry of entries) {
    if (entry.id === 'blank') continue;
    // The label and id name the thing; the description only supports it.
    const name = new Set([...words(entry.label), ...words(entry.id)]);
    const about = new Set(words(entry.description));
    let score = 0;
    for (const [w, weight] of wanted) {
      if (name.has(w)) score += weight * 2;
      else if (about.has(w)) score += weight;
    }
    if (score > (best?.score ?? 0)) best = { id: entry.id, score };
  }
  // One supporting word alone is too thin a reason to leave Blank.
  return best && best.score >= 3 ? best.id : null;
}

/** A short, human name for a Crux from its idea ("a tiny game about frogs" → "Tiny game about frogs"). */
export function nameFromIdea(idea: string): string {
  const cleaned = idea
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /^(please\s+)?((i|we)\s+(want|would like|'d like)\s+to\s+(make|build|create|start)\s+|(make|build|create|start)\s+(me\s+)?)/i,
      '',
    )
    .replace(/^(a|an|the|my|our)\s+/i, '')
    .replace(/[.!?,;:]+$/, '');
  if (!cleaned) return '';
  const first = cleaned.split(/[.!?\n]/)[0]!.trim();
  // Six words at most, and whole words only: drop from the end until it fits.
  const kept = first.split(' ').slice(0, 6);
  while (kept.length > 1 && kept.join(' ').length > 48) kept.pop();
  const short = kept.join(' ');
  return short.charAt(0).toUpperCase() + short.slice(1);
}

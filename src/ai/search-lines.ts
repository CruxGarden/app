/** A disposable worker keeps arbitrary regular expressions off the UI thread. */
export const SEARCH_FILE_CHAR_LIMIT = 2 * 1024 * 1024;
export const SEARCH_TOTAL_CHAR_LIMIT = 16 * 1024 * 1024;
const SEARCH_DEADLINE_MS = 1000;
let activeSearches = 0;

interface SearchInput {
  content: string;
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  limit: number;
}

// Self-contained so the same program runs in browser workers and real test workers.
export function searchLines(input: SearchInput): Array<{ line: number; text: string }> {
  const source = input.regex ? input.query : input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(source, input.caseSensitive ? '' : 'i');
  const found: Array<{ line: number; text: string }> = [];
  const lines = input.content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i]!)) {
      found.push({ line: i + 1, text: lines[i]!.trim().slice(0, 200) });
      if (found.length >= input.limit) break;
    }
  }
  return found;
}

export async function searchFileLines(input: SearchInput): Promise<ReturnType<typeof searchLines>> {
  if (input.content.length > SEARCH_FILE_CHAR_LIMIT)
    throw new Error('Search file exceeds 2 Mi characters; narrow the files before searching.');
  if (input.query.length > 2048) throw new Error('Search query exceeds 2048 characters.');
  if (activeSearches >= 4)
    throw new Error('Search is busy; retry after the current searches finish.');
  activeSearches++;
  let worker: Worker | undefined;
  let url: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    url = URL.createObjectURL(
      new Blob(
        [
          `onmessage = ({data}) => { try { postMessage({matches: (${searchLines.toString()})(data)}); } catch (error) { postMessage({error: error.message}); } };`,
        ],
        { type: 'text/javascript' },
      ),
    );
    worker = new Worker(url);
    return await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Search timed out; simplify the expression and retry.')),
        SEARCH_DEADLINE_MS,
      );
      worker!.onerror = () => reject(new Error('Search worker failed; retry the search.'));
      worker!.onmessage = ({ data }) =>
        data.error ? reject(new Error(data.error)) : resolve(data.matches);
      worker!.postMessage(input);
    });
  } finally {
    clearTimeout(timer);
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
    activeSearches--;
  }
}

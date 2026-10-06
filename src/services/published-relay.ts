import { publishedVisitorApi } from '@/api/published-visitor';
import { searchAuthors } from '@/api/authors';
import { useAppStore } from '@/stores/appStore';

/** Only visitor operations for this Crux may cross the published-frame boundary. */
export function listenForPublishedCalls(
  cruxId: string,
  origin: string,
  frame: () => Window | null,
) {
  const request = publishedVisitorApi(cruxId, origin);
  async function handle(e: MessageEvent) {
    const source = frame();
    if (
      !source ||
      e.source !== source ||
      e.origin !== origin ||
      !e.data ||
      typeof e.data !== 'object'
    )
      return;
    const { type, id, key, value, by, mode } = e.data;
    if (typeof type !== 'string' || !type.startsWith('crux:') || typeof id !== 'string') return;
    const store = `/store/${encodeURIComponent(cruxId)}/${encodeURIComponent(String(key))}`;
    let result: unknown;
    try {
      switch (type) {
        case 'crux:store:get':
          result = (await request(store))?.value;
          break;
        case 'crux:store:set':
          result = await request(store, 'PUT', { value, mode: mode || 'protected' });
          break;
        case 'crux:store:inc':
          result = (
            await request(`${store}/inc`, 'POST', { by: by ?? 1, ...(mode ? { mode } : {}) })
          )?.value;
          break;
        case 'crux:store:del':
          result = await request(store, 'DELETE');
          break;
        case 'crux:store:list':
          throw new Error('Listing every visitor slot requires the authoring app.');
        case 'crux:fn:call':
          result = {
            status: 200,
            body: await request(
              `/fn/${encodeURIComponent(cruxId)}/${encodeURIComponent(String(e.data.name ?? ''))}`,
              'POST',
              e.data.body ?? {},
            ),
          };
          break;
        case 'crux:fn:emit':
          result = {
            status: 202,
            body: await request(
              `/events/${encodeURIComponent(cruxId)}/${encodeURIComponent(String(e.data.name ?? ''))}`,
              'POST',
              e.data.data ?? {},
            ),
          };
          break;
        case 'crux:directory:search':
          result = {
            status: 200,
            body: (await searchAuthors(String(e.data.q ?? ''))).map((a) => ({
              authorId: a.id,
              username: a.username,
              displayName: a.displayName,
            })),
          };
          break;
        case 'crux:visitor': {
          const author = useAppStore.getState().author;
          result = author
            ? { id: author.id, username: author.username, name: author.displayName }
            : null;
          break;
        }
        default:
          return;
      }
      if (frame() === source)
        source.postMessage({ type: `${type}:res`, id, value: result }, origin);
    } catch (error) {
      if (frame() === source)
        source.postMessage(
          {
            type: `${type}:res`,
            id,
            error: error instanceof Error ? error.message : 'Request failed',
          },
          origin,
        );
    }
  }
  const handler = (e: MessageEvent) => {
    void handle(e);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

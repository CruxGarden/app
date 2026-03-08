import { db } from './schema';

let cachedIdentity: { authorId: string; homeId: string } | null = null;

export async function getLocalIdentity(): Promise<{ authorId: string; homeId: string }> {
  if (cachedIdentity) return cachedIdentity;

  let authorId = (await db.settings.get('local:authorId'))?.value as string | undefined;
  let homeId = (await db.settings.get('local:homeId'))?.value as string | undefined;

  if (!authorId || !homeId) {
    authorId = authorId || crypto.randomUUID();
    homeId = homeId || crypto.randomUUID();
    await db.settings.bulkPut([
      { key: 'local:authorId', value: authorId },
      { key: 'local:homeId', value: homeId },
    ]);
  }

  cachedIdentity = { authorId, homeId };
  return cachedIdentity;
}

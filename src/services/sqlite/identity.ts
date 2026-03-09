import { getSqliteClient } from './client';

let cachedIdentity: { authorId: string; homeId: string } | null = null;
let pendingInit: Promise<{ authorId: string; homeId: string }> | null = null;

export async function getLocalIdentity(): Promise<{ authorId: string; homeId: string }> {
  if (cachedIdentity) return cachedIdentity;
  if (pendingInit) return pendingInit;

  pendingInit = (async () => {
    const db = getSqliteClient();
    const authorRow = await db.get<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'cruxgarden:local:authorId'",
    );
    const homeRow = await db.get<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'cruxgarden:local:homeId'",
    );

    let authorId = authorRow?.value;
    let homeId = homeRow?.value;

    if (!authorId || !homeId) {
      authorId = authorId || crypto.randomUUID();
      homeId = homeId || crypto.randomUUID();
      await db.run(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('cruxgarden:local:authorId', ?)",
        [authorId],
      );
      await db.run(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('cruxgarden:local:homeId', ?)",
        [homeId],
      );
    }

    cachedIdentity = { authorId, homeId };
    return cachedIdentity;
  })();

  try {
    return await pendingInit;
  } finally {
    pendingInit = null;
  }
}

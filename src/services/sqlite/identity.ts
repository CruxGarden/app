import { getSqliteClient } from './client';
import { SettingsKey } from '@/lib/constants';

let cachedIdentity: { authorId: string; homeId: string } | null = null;
let pendingInit: Promise<{ authorId: string; homeId: string }> | null = null;

export async function getLocalIdentity(): Promise<{ authorId: string; homeId: string }> {
  const native = getSqliteClient();
  if (native.enterLocalGarden) {
    await native.enterLocalGarden();
    const row = await native.get<{ authorId: string; homeId: string }>(
      `SELECT (SELECT value FROM settings WHERE key = '${SettingsKey.LocalAuthorIdLegacy}') AS authorId,
       (SELECT value FROM settings WHERE key = '${SettingsKey.LocalHomeId}') AS homeId`,
    );
    if (!row?.authorId || !row.homeId) throw new Error('The local Garden identity is unavailable');
    return row;
  }
  if (cachedIdentity) return cachedIdentity;
  if (pendingInit) return pendingInit;

  pendingInit = (async () => {
    const db = getSqliteClient();
    const authorRow = await db.get<{ value: string }>(
      `SELECT value FROM settings WHERE key = '${SettingsKey.LocalAuthorIdLegacy}'`,
    );
    const homeRow = await db.get<{ value: string }>(
      `SELECT value FROM settings WHERE key = '${SettingsKey.LocalHomeId}'`,
    );

    let authorId = authorRow?.value;
    let homeId = homeRow?.value;

    if (!authorId || !homeId) {
      authorId = authorId || crypto.randomUUID();
      homeId = homeId || crypto.randomUUID();
      await db.run(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('${SettingsKey.LocalAuthorIdLegacy}', ?)`,
        [authorId],
      );
      await db.run(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('${SettingsKey.LocalHomeId}', ?)`,
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

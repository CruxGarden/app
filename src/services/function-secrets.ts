import { createKeyedQueue } from '@/lib/keyed-queue';
import { FN_SECRETS_PREFIX } from '@/lib/constants';
import { getSecret, setSecret } from './secrets';

export const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** The encrypted, device-local credentials belonging to one Crux. */
export async function localSecrets(cruxId: string): Promise<Record<string, string>> {
  const raw = await getSecret(FN_SECRETS_PREFIX + cruxId);
  if (raw === null) return Object.create(null);
  try {
    const values: unknown = JSON.parse(raw);
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error();
    for (const [name, value] of Object.entries(values)) {
      if (!SECRET_NAME_RE.test(name) || typeof value !== 'string') throw new Error();
    }
    return Object.assign(Object.create(null), values);
  } catch {
    // JSON parser messages can contain secret values. Keep the diagnostic safe.
    throw new Error(
      'Cannot read stored Function secrets. Restore the credential file before editing them.',
    );
  }
}

const serialize = createKeyedQueue();

/** Serialize read/modify/write for a Crux so concurrent changes keep both edits. */
export async function setLocalSecret(
  cruxId: string,
  name: string,
  value: string | null,
): Promise<Record<string, string>> {
  if (typeof name !== 'string' || !SECRET_NAME_RE.test(name))
    throw new Error('A secret name is letters, digits and underscores.');
  if (value !== null && typeof value !== 'string') throw new Error('A secret value must be text.');
  return serialize(cruxId, async () => {
    const values = await localSecrets(cruxId);
    if (value === null) delete values[name];
    else values[name] = value;
    await setSecret(FN_SECRETS_PREFIX + cruxId, JSON.stringify(values));
    return values;
  });
}

/** Presentation/work metadata that may leave this installation in a publication.
 * Private graph archives apply the API's own portable record policy. */
export function portableMeta(raw: unknown): Record<string, unknown> {
  const meta = { ...(typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {})) };
  for (const key of [
    'projectFolder',
    'publishedAt',
    'publishedVersion',
    'publishedFingerprints',
    'turnJob',
    'turnQueue',
    'agentHost',
  ])
    delete meta[key];
  if (meta.settings) {
    meta.settings = { ...meta.settings };
    delete meta.settings.agentSessionId;
    delete meta.settings.agentSessions;
    delete meta.settings.agentHost;
  }
  return meta;
}

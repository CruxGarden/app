/** Web Mode compatibility mirror of api/src/local/desktop-reference-sql.ts.
 * Desktop recovery is owned by the API. Keep the typed-reference fixtures in both
 * repositories aligned while the browser adapter remains supported. */
export function recoveryContentSql(tables: ReadonlySet<string>): string {
  const refs = [
    'SELECT fingerprint FROM artifacts',
    "SELECT json_extract(meta, '$.avatarFingerprint') AS fingerprint FROM authors",
  ];
  const owners = ['SELECT meta AS data FROM cruxes'];
  if (tables.has('working_copies')) owners.push('SELECT meta AS data FROM working_copies');
  const portraitOwners = `(${owners.join(' UNION ALL ')})`;
  const fromObject = (source: string, path: string) =>
    `SELECT json_extract(data, '${path}') AS fingerprint FROM ${source}`;
  const fromMap = (source: string, path: string, field: string) =>
    `SELECT CASE WHEN entry.type = 'object' THEN json_extract(entry.value, '${field}') END AS fingerprint FROM ${source} AS owner, json_each(owner.data, '${path}') AS entry`;
  refs.push(fromMap(portraitOwners, '$.authorSnapshots', '$.avatarFingerprint'));
  for (const key of ['thumbnailFingerprint', 'thumbnailFingerprintLight'])
    refs.push(fromMap(portraitOwners, '$.personaSnapshots', `$.${key}`));

  if (tables.has('task_merges')) {
    const journals = '(SELECT data FROM task_merges)';
    for (const key of ['base', 'main', 'task', 'manifest'])
      refs.push(fromMap(journals, `$.${key}`, '$.fingerprint'));
    for (const key of ['base', 'main', 'task'])
      refs.push(fromMap(journals, '$.conflicts', `$.${key}.fingerprint`));
  }

  // Empty values mean unset in the existing settings representation.
  const setting = (key: string) =>
    `(SELECT NULLIF(value, '') AS data FROM settings WHERE key = 'cruxgarden:${key}')`;
  refs.push(
    "SELECT value AS fingerprint FROM settings WHERE key IN ('cruxgarden:backgroundImage', 'cruxgarden:moodCover') AND value <> ''",
  );
  for (const key of ['thumbnailFingerprint', 'thumbnailFingerprintLight'])
    refs.push(fromObject(setting('persona'), `$.${key}`));
  refs.push(fromObject(setting('soundTrack'), '$.fingerprint'));
  refs.push(fromMap(setting('moodAssets'), '$', '$.fingerprint'));

  const tokenRefs = (source: string, path: string) =>
    `SELECT substr(token.value, 7) AS fingerprint FROM ${source} AS owner, json_each(owner.data, '${path}') AS token WHERE token.type = 'text' AND substr(token.value, 1, 6) = 'asset:'`;
  for (const key of ['moodThemeDark', 'moodThemeLight']) refs.push(tokenRefs(setting(key), '$'));
  const objectsIn = (source: string) =>
    `(SELECT CASE WHEN entry.type = 'object' THEN entry.value END AS data FROM ${source} AS owner, json_each(owner.data) AS entry)`;
  refs.push(tokenRefs(objectsIn(setting('moodUserPresets')), '$.overrides'));
  const packages = objectsIn(setting('moodPackages'));
  for (const path of [
    '$.cover',
    '$.background.image',
    '$.persona.thumbnailFingerprint',
    '$.persona.thumbnailFingerprintLight',
    '$.sound.track.fingerprint',
  ])
    refs.push(fromObject(packages, path));
  refs.push(fromMap(packages, '$.assets', '$.fingerprint'));
  refs.push(tokenRefs(packages, '$.theme.overrides'));
  return `SELECT DISTINCT fingerprint FROM (${refs.join('\nUNION ALL\n')}) WHERE fingerprint IS NOT NULL ORDER BY fingerprint`;
}

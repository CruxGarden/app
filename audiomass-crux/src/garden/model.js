export function validateProject(doc) {
  const fail = () => {
    throw new Error('Choose a valid AudioMass project.');
  };
  if (!doc || doc.version !== 1 || doc.app !== 'audiomass') fail();
  if (doc.project === null) return;
  const p = doc.project;
  if (
    !p ||
    !p.multitrack ||
    typeof p.multitrackOn !== 'boolean' ||
    !Array.isArray(p.multitrack.tracks) ||
    p.multitrack.tracks.length > 128 ||
    !Array.isArray(p.multitrack.clips) ||
    p.multitrack.clips.length > 2000
  )
    fail();
  const ids = new Set();
  for (const t of p.multitrack.tracks) {
    if (
      !t ||
      typeof t.id !== 'string' ||
      ids.has(t.id) ||
      typeof t.name !== 'string' ||
      t.name.length > 300
    )
      fail();
    ids.add(t.id);
    for (const k of ['vol', 'pan']) if (!Number.isFinite(t[k])) fail();
  }
  const clips = new Set();
  let total = 0;
  const seen = new Set();
  function audio(value) {
    if (value === null) return;
    const a = value?.__cruxAudio;
    if (
      !a ||
      !Number.isInteger(a.length) ||
      a.length <= 0 ||
      a.length > 32_000_000 ||
      !Number.isFinite(a.sampleRate) ||
      a.sampleRate < 8000 ||
      a.sampleRate > 192000 ||
      !Array.isArray(a.channels) ||
      !a.channels.length ||
      a.channels.length > 32
    )
      fail();
    for (const c of a.channels) {
      const b = c?.__cruxBinary;
      if (
        !b ||
        !/^assets\/[a-f0-9]{64}\.bin$/.test(b.path) ||
        b.kind !== 'buffer' ||
        b.type !== 'application/octet-stream' ||
        b.size !== a.length * 4
      )
        fail();
      if (!seen.has(b.path)) {
        seen.add(b.path);
        total += b.size;
      }
    }
    if (total > 256_000_000) throw new Error('Keep decoded audio below 256 MB per project.');
  }
  audio(p.waveform);
  for (const c of p.multitrack.clips) {
    if (!c || typeof c.id !== 'string' || clips.has(c.id) || !ids.has(c.track) || !c.buffer) fail();
    clips.add(c.id);
    for (const k of ['start', 'in', 'out', 'fi', 'fo'])
      if (!Number.isFinite(c[k]) || c[k] < 0) fail();
    audio(c.buffer);
    if (
      c.out < c.in ||
      c.out > c.buffer.__cruxAudio.length / c.buffer.__cruxAudio.sampleRate + 0.001
    )
      fail();
  }
  for (const markers of [p.editorMarkers, p.multitrackMarkers]) {
    if (!Array.isArray(markers) || markers.length > 10000) fail();
  }
}

import { describe, it, expect } from 'vitest';
import { personaSnapshotOf, getPersonaFingerprint, DEFAULT_PERSONA } from './persona';

describe('personaSnapshotOf', () => {
  it('records identity fields and fingerprint references only', () => {
    const snap = personaSnapshotOf({
      ...DEFAULT_PERSONA,
      name: 'Fern',
      thumbnailFingerprint: 'abc',
      thumbnailDataUrl: 'data:image/png;base64,AAAA',
    });
    expect(snap).toEqual({
      name: 'Fern',
      greeting: DEFAULT_PERSONA.greeting,
      systemPrompt: DEFAULT_PERSONA.systemPrompt,
      thumbnailFingerprint: 'abc',
      thumbnailFingerprintLight: null,
    });
    expect('thumbnailDataUrl' in snap).toBe(false);
  });
  it('normalises empty thumbnail fingerprints to null', () => {
    const snap = personaSnapshotOf({ ...DEFAULT_PERSONA, thumbnailFingerprint: '' });
    expect(snap.thumbnailFingerprint).toBeNull();
  });
  it('fingerprint depends on identity, not visuals', () => {
    const a = getPersonaFingerprint(DEFAULT_PERSONA);
    expect(getPersonaFingerprint({ ...DEFAULT_PERSONA, thumbnailFingerprint: 'x' })).toBe(a);
    expect(getPersonaFingerprint({ ...DEFAULT_PERSONA, name: 'Other' })).not.toBe(a);
  });
});

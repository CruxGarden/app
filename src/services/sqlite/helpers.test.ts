import { describe, it, expect } from 'vitest';
import { hashContent, toRow, fromRow, toArtifact, buildInsert, buildUpdate } from './helpers';

/**
 * Tests for the storage primitives everything else stands on: the Fingerprint
 * (SHA-256 content addressing — the identity of all content in the Blob Store
 * and the .crux/.garden formats) and the row⇄entity conversion helpers.
 */

describe('hashContent (the Fingerprint)', () => {
  // Published SHA-256 test vectors — if these ever fail, every fingerprint
  // in every Blob Store and export archive is suspect.
  it('matches the SHA-256 specification test vectors', async () => {
    expect(await hashContent('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await hashContent('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('produces the same fingerprint for the same content in any input form', async () => {
    const text = 'The Keeper tends the garden.';
    const bytes = new TextEncoder().encode(text);
    const fromString = await hashContent(text);
    const fromBytes = await hashContent(bytes);
    const fromBlob = await hashContent(new Blob([bytes]));
    expect(fromBytes).toBe(fromString);
    expect(fromBlob).toBe(fromString);
    expect(fromString).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different content never shares a fingerprint (sanity)', async () => {
    expect(await hashContent('a')).not.toBe(await hashContent('b'));
    // Byte-level difference invisible to trim/normalize must still differ
    expect(await hashContent('line\n')).not.toBe(await hashContent('line\r\n'));
  });
});

describe('row ⇄ entity conversion', () => {
  it('toRow converts camelCase keys to snake_case', () => {
    expect(toRow({ resourceId: 'r1', mimeType: 'text/html', id: 'x' })).toEqual({
      resource_id: 'r1',
      mime_type: 'text/html',
      id: 'x',
    });
  });

  it('fromRow converts back, parses meta JSON, and booleanizes flags', () => {
    const entity = fromRow<Record<string, unknown>>({
      resource_id: 'r1',
      meta: '{"path":"index.html"}',
      discoverable: 1,
      system: 0,
    });
    expect(entity.resourceId).toBe('r1');
    expect(entity.meta).toEqual({ path: 'index.html' });
    expect(entity.discoverable).toBe(true);
    expect(entity.system).toBe(false);
  });

  it('fromRow tolerates malformed meta JSON (empty object, not a crash)', () => {
    const entity = fromRow<Record<string, unknown>>({ meta: '{not json' });
    expect(entity.meta).toEqual({});
  });

  it('toArtifact strips internal columns but keeps the fingerprint', () => {
    const artifact = toArtifact({
      id: 'a1',
      content: 'SHOULD NOT LEAK',
      path: 'internal-column',
      fingerprint: 'f'.repeat(64),
      mime_type: 'text/html',
      meta: '{"path":"index.html"}',
    });
    expect((artifact as unknown as Record<string, unknown>).content).toBeUndefined();
    expect((artifact as unknown as Record<string, unknown>).path).toBeUndefined();
    expect(artifact.fingerprint).toBe('f'.repeat(64));
    expect(artifact.mimeType).toBe('text/html');
    expect(artifact.meta?.path).toBe('index.html');
  });
});

describe('SQL builders', () => {
  it('buildInsert snake_cases columns, JSON-stringifies objects, nulls undefined, passes bytes raw', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { sql, params } = buildInsert('artifacts', {
      resourceId: 'r1',
      meta: { path: 'a.txt' },
      description: undefined,
      data: bytes,
    });
    expect(sql).toBe(
      'INSERT INTO artifacts (resource_id, meta, description, data) VALUES (?, ?, ?, ?)',
    );
    expect(params[0]).toBe('r1');
    expect(params[1]).toBe('{"path":"a.txt"}');
    expect(params[2]).toBeNull();
    expect(params[3]).toBe(bytes); // Uint8Array must NOT be stringified
  });

  it('buildUpdate targets the row by id with the same conversions', () => {
    const { sql, params } = buildUpdate('cruxes', 'crux-1', {
      title: 'New Title',
      meta: { growthCount: 2 },
    });
    expect(sql).toBe('UPDATE cruxes SET title = ?, meta = ? WHERE id = ?');
    expect(params).toEqual(['New Title', '{"growthCount":2}', 'crux-1']);
  });
});

import { test, expect } from '@playwright/test';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
  statSync,
  readdirSync,
  symlinkSync,
  linkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecretStore } from '../src/secrets';

test('damaged credential files are reported and preserved, then recover after repair', () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-secrets-'));
  const file = join(folder, 'secrets.json');
  try {
    writeFileSync(file, '{damaged');
    const store = new SecretStore(folder);
    expect(() => store.get('example')).toThrow('stored credentials');
    expect(() => store.delete('example')).toThrow('stored credentials');
    expect(readFileSync(file, 'utf8')).toBe('{damaged');
    writeFileSync(file, '{}');
    expect(store.get('example')).toBeNull();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

// OS encryption is the only substituted boundary. These tests exercise real
// files, permissions, atomic replacement and reopen; they do not certify an OS vault.
function encryption() {
  return {
    unlocked: true,
    backend: 'gnome_libsecret',
    isEncryptionAvailable() {
      return this.unlocked;
    },
    getSelectedStorageBackend() {
      return this.backend;
    },
    encryptString(value: string) {
      return Buffer.from(`fixture:${value}`);
    },
    decryptString(value: Buffer) {
      if (!this.unlocked || !value.toString().startsWith('fixture:'))
        throw new Error('private detail');
      return value.toString().slice(8);
    },
  };
}

test('failed replacements and deletions preserve committed credentials, and retries survive reopening', () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-secrets-'));
  const file = join(folder, 'secrets.json');
  const cipher = encryption();
  const store = new SecretStore(folder, cipher);
  try {
    store.set('__proto__', 'first');
    store.set('other', 'keep');
    const original = readFileSync(file);
    // Windows exposes a file read-only flag, not POSIX directory permissions.
    const windows = process.platform === 'win32';
    chmodSync(windows ? file : folder, windows ? 0o400 : 0o500);
    expect(() => store.set('__proto__', 'replacement')).toThrow('Could not save credentials');
    expect(() => store.delete('other')).toThrow('Could not save credentials');
    expect(readFileSync(file)).toEqual(original);
    expect(store.get('__proto__')).toBe('first');
    chmodSync(windows ? file : folder, windows ? 0o600 : 0o700);
    store.set('__proto__', 'replacement');
    store.delete('other');
    const reopened = new SecretStore(folder, cipher);
    expect(reopened.get('__proto__')).toBe('replacement');
    expect(reopened.get('other')).toBeNull();
    if (!windows) expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(folder)).toEqual(['secrets.json']);
  } finally {
    chmodSync(file, 0o600);
    chmodSync(folder, 0o700);
    rmSync(folder, { recursive: true, force: true });
  }
});

test('unavailable, insecure and corrupt encryption fail explicitly without changing saved credentials', () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-secrets-'));
  const file = join(folder, 'secrets.json');
  const cipher = encryption();
  const store = new SecretStore(folder, cipher, 'linux');
  try {
    store.set('example', 'saved');
    const original = readFileSync(file);
    const encrypt = cipher.encryptString;
    cipher.encryptString = () => {
      throw new Error('private OS diagnostic');
    };
    expect(() => store.set('example', 'replacement')).toThrow('Could not encrypt credentials');
    expect(readFileSync(file)).toEqual(original);
    cipher.encryptString = encrypt;
    cipher.unlocked = false;
    expect(store.get('missing')).toBeNull();
    expect(() => store.get('example')).toThrow('unavailable');
    expect(() => store.set('example', 'replacement')).toThrow('unavailable');
    cipher.unlocked = true;
    for (const backend of ['basic_text', 'unknown']) {
      cipher.backend = backend;
      expect(store.available()).toBe(false);
      expect(() => store.get('example')).toThrow('unavailable');
      expect(() => store.set('example', 'replacement')).toThrow('unavailable');
    }
    expect(readFileSync(file)).toEqual(original);
    cipher.backend = 'gnome_libsecret';
    expect(store.get('example')).toBe('saved');
    writeFileSync(file, JSON.stringify({ example: Buffer.from('damaged').toString('base64') }));
    expect(() => store.get('example')).toThrow('Cannot unlock stored credentials');
    cipher.unlocked = false;
    store.delete('example'); // Explicit removal does not need the OS vault.
    expect(store.get('example')).toBeNull();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('invalid, oversized and linked stores are refused without altering their targets', () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-secrets-'));
  const file = join(folder, 'secrets.json');
  const target = join(folder, 'target');
  const store = new SecretStore(folder, encryption());
  try {
    for (const damaged of [
      'null',
      '[]',
      '{"key":3}',
      '{"key":"invalid-base64"}',
      ' '.repeat(1024 * 1024 + 1),
    ]) {
      writeFileSync(file, damaged);
      expect(() => store.get('key')).toThrow('stored credentials');
      expect(() => store.set('key', 'new')).toThrow('stored credentials');
      expect(readFileSync(file, 'utf8')).toBe(damaged);
    }
    rmSync(file);
    writeFileSync(target, '{}');
    symlinkSync(target, file);
    expect(() => store.set('key', 'new')).toThrow('stored credentials');
    expect(readFileSync(target, 'utf8')).toBe('{}');
    rmSync(file);
    linkSync(target, file);
    expect(() => store.set('key', 'new')).toThrow('stored credentials');
    expect(readFileSync(target, 'utf8')).toBe('{}');
    rmSync(file);
    expect(() => store.set('key', 'x'.repeat(64 * 1024 + 1))).toThrow('too large');
    expect(() => store.get('')).toThrow('Invalid credential name');
    expect(readdirSync(folder)).toEqual(['target']);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

interface SecretEncryption {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

const MAX_STORE_BYTES = 1024 * 1024;
const MAX_VALUE_BYTES = 64 * 1024;
const READ_ERROR =
  'Cannot read stored credentials. Repair or restore secrets.json before trying again.';

/**
 * Owns the private ciphertext file. A failed read is never an empty store; a
 * failed write leaves the previous file intact. No cache can outlive a repair.
 * Encryption stays synchronous so read/modify/rename is one main-process turn.
 */
export class SecretStore {
  private readonly filePath: string;

  constructor(
    userDataPath: string,
    private readonly encryption: SecretEncryption = require('electron').safeStorage,
    private readonly platform: string = process.platform,
  ) {
    this.filePath = path.join(userDataPath, 'secrets.json');
  }

  available(): boolean {
    try {
      if (!this.encryption.isEncryptionAvailable()) return false;
      // Electron's basic_text backend uses a hardcoded password, not an OS vault.
      return (
        this.platform !== 'linux' ||
        ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(
          this.encryption.getSelectedStorageBackend(),
        )
      );
    } catch {
      return false;
    }
  }

  private requireEncryption(): void {
    if (!this.available()) {
      throw new Error(
        'Secure credential storage is unavailable. Unlock your system keychain and try again.',
      );
    }
  }

  private validateKey(key: string): void {
    if (
      typeof key !== 'string' ||
      !key.length ||
      key.length > 256 ||
      [...key].some((character) => character.charCodeAt(0) < 32)
    ) {
      throw new Error('Invalid credential name.');
    }
  }

  private load(): Record<string, string> {
    let fd: number;
    try {
      const info = fs.lstatSync(this.filePath);
      if (!info.isFile() || info.nlink !== 1) throw new Error(READ_ERROR);
      fd = fs.openSync(this.filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.create(null);
      throw new Error(READ_ERROR, { cause: error });
    }
    try {
      const info = fs.fstatSync(fd);
      if (!info.isFile() || info.nlink !== 1 || info.size > MAX_STORE_BYTES) throw new Error();
      // Read one extra byte to detect growth without an unbounded allocation.
      const bytes = Buffer.alloc(MAX_STORE_BYTES + 1);
      let size = 0;
      while (size < bytes.length) {
        const read = fs.readSync(fd, bytes, size, bytes.length - size, null);
        if (read === 0) break;
        size += read;
      }
      if (size > MAX_STORE_BYTES) throw new Error();
      const data: unknown = JSON.parse(bytes.subarray(0, size).toString('utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      for (const [key, value] of Object.entries(data)) {
        this.validateKey(key);
        if (
          typeof value !== 'string' ||
          !value.length ||
          Buffer.from(value, 'base64').toString('base64') !== value
        )
          throw new Error();
      }
      return Object.assign(Object.create(null), data);
    } catch {
      throw new Error(READ_ERROR);
    } finally {
      fs.closeSync(fd);
    }
  }

  private persist(store: Record<string, string>): void {
    const bytes = Buffer.from(JSON.stringify(store, null, 2));
    if (bytes.length > MAX_STORE_BYTES) throw new Error('Credential storage is full.');
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    let fd: number | undefined;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temporary, this.filePath);
    } catch {
      throw new Error(
        'Could not save credentials. Check available disk space and profile permissions, then try again.',
      );
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      fs.rmSync(temporary, { force: true });
    }
  }

  get(key: string): string | null {
    this.validateKey(key);
    const entry = this.load()[key];
    if (entry === undefined) return null; // Do not prompt Keychain for a missing key.
    this.requireEncryption();
    try {
      return this.encryption.decryptString(Buffer.from(entry, 'base64'));
    } catch {
      throw new Error(
        'Cannot unlock stored credentials. Unlock your system keychain and try again.',
      );
    }
  }

  set(key: string, value: string): void {
    this.validateKey(key);
    if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_VALUE_BYTES) {
      throw new Error('Credential value is too large or invalid.');
    }
    const store = this.load();
    this.requireEncryption();
    try {
      store[key] = this.encryption.encryptString(value).toString('base64');
    } catch {
      throw new Error('Could not encrypt credentials. Unlock your system keychain and try again.');
    }
    this.persist(store);
  }

  delete(key: string): void {
    this.validateKey(key);
    const store = this.load();
    if (Object.hasOwn(store, key)) {
      delete store[key];
      this.persist(store);
    }
  }
}

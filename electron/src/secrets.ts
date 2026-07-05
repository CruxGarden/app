const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Main-process secret store (BYOK API keys).
 *
 * Values are encrypted with Electron safeStorage (macOS: Keychain-backed key)
 * and persisted as base64 ciphertext in userData/secrets.json. Plaintext never
 * touches the SQLite database or any export surface, and only crosses IPC when
 * the renderer explicitly reads a key.
 */
export class SecretStore {
  private filePath: string;
  private cache: Record<string, string> | null = null; // key -> base64 ciphertext

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'secrets.json');
  }

  available(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  private load(): Record<string, string> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      this.cache = {};
    }
    return this.cache!;
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.load(), null, 2), { mode: 0o600 });
  }

  get(key: string): string | null {
    const entry = this.load()[key];
    if (!entry) return null;
    try {
      return safeStorage.decryptString(Buffer.from(entry, 'base64'));
    } catch {
      return null; // ciphertext from another machine/keychain — treat as absent
    }
  }

  set(key: string, value: string): void {
    if (!this.available()) throw new Error('safeStorage encryption unavailable');
    this.load()[key] = safeStorage.encryptString(value).toString('base64');
    this.persist();
  }

  delete(key: string): void {
    const store = this.load();
    if (key in store) {
      delete store[key];
      this.persist();
    }
  }
}

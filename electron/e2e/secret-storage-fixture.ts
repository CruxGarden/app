import type { ElectronApplication } from '@playwright/test';

export async function fixtureKeychain(app: ElectronApplication, unlocked: boolean) {
  await app.evaluate(({ safeStorage }, unlocked) => {
    // Substitute only the OS vault: use authenticated encryption with a fixture
    // key. Production IPC, filesystem and UI remain real; no OS prompt or secret.
    const crypto = process.getBuiltinModule('crypto');
    const key = Buffer.alloc(32, 42);
    safeStorage.isEncryptionAvailable = () => unlocked;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = (value: string) => {
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
      const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), bytes]);
    };
    safeStorage.decryptString = (bytes: Buffer) => {
      const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
    };
  }, unlocked);
}

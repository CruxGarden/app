import { config } from "../config";

function getPrefixedKey(key: string) {
  return `${config.version.major}.${config.version.minor}_${key}`;
}
const memory = new Map<string, string>();
const embedded = window.parent !== window;
export const localStorage = {
  getItem: (key: string): string | null =>
    embedded ? (memory.get("local:" + key) ?? null) : window.localStorage.getItem(getPrefixedKey(key)),
  setItem: (key: string, data: string): void =>
    embedded ? void memory.set("local:" + key, data) : window.localStorage.setItem(getPrefixedKey(key), data),
  removeItem: (key: string): void =>
    embedded ? void memory.delete("local:" + key) : window.localStorage.removeItem(getPrefixedKey(key)),
};

export const sessionStorage = {
  getItem: (key: string): string | null =>
    embedded ? (memory.get("session:" + key) ?? null) : window.sessionStorage.getItem(getPrefixedKey(key)),
  setItem: (key: string, data: string): void =>
    embedded ? void memory.set("session:" + key, data) : window.sessionStorage.setItem(getPrefixedKey(key), data),
  removeItem: (key: string): void =>
    embedded ? void memory.delete("session:" + key) : window.sessionStorage.removeItem(getPrefixedKey(key)),
};

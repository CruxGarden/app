import axios, { type InternalAxiosRequestConfig } from 'axios';
import { SettingsKey } from '@/lib/constants';
import { getSetting } from '@/services/settings';

/** The API the build was made for (crux.garden in production). */
export const DEFAULT_API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * The API this garden talks to — a garden setting, not a build constant
 * (ADR 0049's first step): the address the shell was launched with
 * (CRUX_API_URL, a mock API in the e2e suite or a deliberate override) wins,
 * then the address chosen in Settings → Connection, then the build's default.
 * Read at every call, so changing it in Settings takes effect at once.
 */
export function apiBaseUrl(): string {
  const launched = typeof window !== 'undefined' ? window.electronAPI?.config?.apiUrl : null;
  if (launched) return launched;
  const chosen = normalizeApiUrl(getSetting(SettingsKey.ApiUrl));
  return chosen || DEFAULT_API_URL;
}

/** Trims and drops a trailing slash; null or blank means the default. */
export function normalizeApiUrl(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().replace(/\/+$/, '');
  return v ? v : null;
}

/** True when the address came with the launch (an e2e mock API) and cannot be changed in Settings. */
export function apiUrlIsLaunched(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.config?.apiUrl;
}

const client = axios.create({
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});
// The base is resolved per request, so a changed setting needs no reload.
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.baseURL = apiBaseUrl();
  return config;
});

// ── Token management ──────────────────────────────────

export function getStoredTokens() {
  return {
    accessToken: localStorage.getItem(SettingsKey.AccessToken),
    refreshToken: localStorage.getItem(SettingsKey.RefreshToken),
  };
}

export function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(SettingsKey.AccessToken, accessToken);
  localStorage.setItem(SettingsKey.RefreshToken, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(SettingsKey.AccessToken);
  localStorage.removeItem(SettingsKey.RefreshToken);
}

// ── Request interceptor: attach JWT ───────────────────

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { accessToken } = getStoredTokens();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ── Response interceptor: auto-refresh on 401 ─────────

let refreshPromise: Promise<string> | null = null;

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry || original.url === '/auth/token') {
      return Promise.reject(error);
    }

    original._retry = true;

    const { refreshToken } = getStoredTokens();
    if (!refreshToken) {
      clearTokens();
      return Promise.reject(error);
    }

    // Dedupe concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = client
        .post<{ accessToken: string; refreshToken: string }>('/auth/token', { refreshToken })
        .then((res) => {
          storeTokens(res.data.accessToken, res.data.refreshToken);
          return res.data.accessToken;
        })
        .catch((err) => {
          clearTokens();
          throw err;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    const newToken = await refreshPromise;
    original.headers.Authorization = `Bearer ${newToken}`;
    return client(original);
  },
);

export default client;

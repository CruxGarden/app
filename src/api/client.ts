import axios, { type InternalAxiosRequestConfig } from 'axios';
import { SettingsKey } from '@/lib/constants';

// Desktop e2e tests launch the shell with CRUX_API_URL to substitute a local
// mock API; everything else uses the build-time value.
const API_BASE_URL: string =
  (typeof window !== 'undefined' && window.electronAPI?.test?.apiUrl) ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
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

export { API_BASE_URL };
export default client;

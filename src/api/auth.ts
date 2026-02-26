import client from './client';
import type { AuthCredentials, Profile } from './types';

export async function requestCode(email: string): Promise<{ message: string }> {
  const res = await client.post<{ message: string }>('/auth/code', { email });
  return res.data;
}

export async function login(email: string, code: string): Promise<AuthCredentials> {
  const res = await client.post<AuthCredentials>('/auth/login', { email, code });
  return res.data;
}

export async function refreshToken(token: string): Promise<AuthCredentials> {
  const res = await client.post<AuthCredentials>('/auth/token', { refreshToken: token });
  return res.data;
}

export async function getProfile(): Promise<Profile> {
  const res = await client.get<Profile>('/auth/profile');
  return res.data;
}

export async function logout(): Promise<void> {
  await client.delete('/auth/logout');
}

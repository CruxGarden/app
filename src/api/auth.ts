import client from './client';
import type { AuthCredentials, Profile } from './types';
import { captureAuth, type AuthContext } from './session';

export async function requestCode(email: string): Promise<{ message: string }> {
  const res = await client.post<{ message: string }>(
    '/auth/code',
    { email },
    { skipAuthentication: true },
  );
  return res.data;
}

export async function login(
  email: string,
  code: string,
  context: AuthContext = captureAuth(),
): Promise<AuthCredentials> {
  const res = await client.post<AuthCredentials>(
    '/auth/login',
    { email, code },
    { authContext: context, skipAuthentication: true },
  );
  return res.data;
}

export async function getProfile(context: AuthContext = captureAuth()): Promise<Profile> {
  const res = await client.get<Profile>('/auth/profile', { authContext: context });
  return res.data;
}

export async function logout(context: AuthContext = captureAuth()): Promise<void> {
  await client.delete('/auth/logout', { authContext: context, _retry: true });
}

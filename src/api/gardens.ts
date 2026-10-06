import client from './client';
import { callFunction } from '@/services/crux-functions';

/**
 * Gardens with people (GARDEN-MEMBERS-PLAN): a garden is a published crux of
 * kind `garden` whose Store holds its members; the API answers "which gardens
 * am I in" by reading those Stores. Everything else goes through the garden's
 * own functions, called as the signed-in person.
 */
export interface Membership {
  authorId: string;
  username: string;
  displayName: string;
  role: 'owner' | 'editor' | 'member';
  status: 'invited' | 'active';
  since: string;
  invitedBy: string | null;
}
export interface MyGarden {
  cruxId: string;
  title: string;
  slug: string;
  authorId: string;
  authorUsername: string;
  published: boolean;
  membership: Membership;
  updatedAt: string;
}

export async function myGardens(): Promise<MyGarden[]> {
  const res = await client.get<MyGarden[]>('/store/gardens/mine');
  return res.data;
}

/** Say yes to an invitation: the garden's own accept function, as me. */
export async function acceptInvitation(
  gardenCruxId: string,
  me: { username: string; displayName: string },
): Promise<Membership> {
  const r = await callFunction(gardenCruxId, 'accept', me);
  if (r.status >= 400)
    throw new Error(String((r.body as { error?: string })?.error ?? 'Could not accept'));
  return r.body as Membership;
}

/** Put one of my published cruxes on a garden's shelf. */
export async function shareIntoGarden(
  gardenCruxId: string,
  crux: { cruxId: string; title: string; url: string },
): Promise<void> {
  const r = await callFunction(gardenCruxId, 'share', crux);
  if (r.status >= 400)
    throw new Error(String((r.body as { error?: string })?.error ?? 'Could not share'));
}

/** Invite someone from the directory (owner or editor). */
export async function inviteToGarden(
  gardenCruxId: string,
  person: { authorId: string; username: string; displayName: string; role?: 'member' | 'editor' },
): Promise<Membership> {
  const r = await callFunction(gardenCruxId, 'invite', person);
  if (r.status >= 400)
    throw new Error(String((r.body as { error?: string })?.error ?? 'Could not invite'));
  return r.body as Membership;
}

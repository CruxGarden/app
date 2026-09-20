import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import {
  LOCAL_API,
  LOCAL_API_LOG,
  lastCodeFor,
  useLocalApi,
  signInLocally,
} from './local-api-helpers';

/**
 * People at the garden level (GARDEN-MEMBERS-PLAN slice 1), against the API
 * on this machine: a person plants a Garden crux and shares it; its owner
 * membership and card are written by its own functions; the directory finds
 * a second person; an invitation is written; the second person sees the
 * garden under "mine", accepts, and puts something on the shelf; a direct
 * Store write around the functions is refused; the first person's Home
 * lists the garden. Opt-in — see local-api-helpers.ts.
 */
test.skip(!LOCAL_API || !LOCAL_API_LOG, 'set CRUX_LOCAL_API and CRUX_LOCAL_API_LOG');

/** A second person, straight through the API: sign-in code from the log, then an author. */
async function secondPerson(
  tag: string,
): Promise<{ api: APIRequestContext; authorId: string; username: string }> {
  const email = `neighbour-${tag}@example.com`;
  const anon = await request.newContext({ baseURL: LOCAL_API });
  expect((await anon.post('/auth/code', { data: { email } })).ok()).toBe(true);
  let code: string | null = null;
  await expect.poll(() => (code = lastCodeFor(email)), { timeout: 15000 }).not.toBeNull();
  const login = await anon.post('/auth/login', { data: { email, code } });
  expect(login.ok()).toBe(true);
  const { accessToken } = (await login.json()) as { accessToken: string };
  await anon.dispose();
  const api = await request.newContext({
    baseURL: LOCAL_API,
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
  // Signing in made an author with a generated name; give them a real one.
  const account = (await (await api.get('/auth/profile')).json()) as { id: string };
  const authors = (await (await api.get('/authors', { params: { limit: 500 } })).json()) as {
    id: string;
    accountId: string;
  }[];
  const mine = authors.find((a) => a.accountId === account.id);
  expect(mine).toBeTruthy();
  const username = `neighbour${tag}`;
  const renamed = await api.patch(`/authors/${mine!.id}`, {
    data: { username, displayName: 'The Neighbour' },
  });
  expect(renamed.ok()).toBe(true);
  return { api, authorId: mine!.id, username };
}

test('a garden with people: plant, share, invite from the directory, accept, share onto the shelf', async () => {
  test.setTimeout(300_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await useLocalApi(page);
    await signInLocally(page);
    await page.keyboard.press('Escape');

    // The owner plants a Garden and shares it.
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Garden/ }).click();
    await page.getByPlaceholder('Our garden').fill('The Allotment');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const gardenId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    await page.getByRole('button', { name: 'Toggle share' }).click();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const backupAsk = page
      .getByRole('dialog')
      .filter({ hasText: 'A published site is not a backup' });
    if (await backupAsk.isVisible({ timeout: 3000 }).catch(() => false))
      await backupAsk.getByRole('button', { name: 'Share without a backup' }).click();
    await expect(page.getByText('Up to date')).toBeVisible({ timeout: 120_000 });

    // The owner, as the API knows them.
    const token = await page.evaluate(() => localStorage.getItem('cruxgarden:accessToken'));
    expect(token).toBeTruthy();
    const owner = await request.newContext({
      baseURL: LOCAL_API,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const me = (await (await owner.get('/auth/profile')).json()) as { id: string };
    expect(me.id).toBeTruthy();
    const who = await owner.post(`/fn/${gardenId}/whoami`, {
      data: { username: 'owner', displayName: 'The Owner' },
    });
    expect(who.ok()).toBe(true);
    expect(await who.json()).toMatchObject({ me: { role: 'owner', status: 'active' } });
    expect(
      (
        await owner.post(`/fn/${gardenId}/setup`, {
          data: { name: 'The Allotment', description: 'Plots and tea.' },
        })
      ).ok(),
    ).toBe(true);

    // The directory finds the neighbour; the owner invites them.
    const tag = Date.now().toString(36);
    const b = await secondPerson(tag);
    const found = (await (await owner.get(`/authors/search?q=neighbour${tag}`)).json()) as {
      id: string;
      username: string;
      displayName: string;
    }[];
    expect(found.map((a) => a.username)).toContain(b.username);
    const invited = await owner.post(`/fn/${gardenId}/invite`, {
      data: {
        authorId: b.authorId,
        username: b.username,
        displayName: 'The Neighbour',
        role: 'member',
      },
    });
    expect(invited.ok()).toBe(true);
    expect(await invited.json()).toMatchObject({ role: 'member', status: 'invited' });

    // The neighbour sees the invitation under their gardens, accepts, and shares something.
    const mine = (await (await b.api.get('/store/gardens/mine')).json()) as {
      cruxId: string;
      title: string;
      membership: { status: string };
    }[];
    expect(mine.find((g) => g.cruxId === gardenId)).toMatchObject({
      title: 'The Allotment',
      membership: { status: 'invited' },
    });
    const accepted = await b.api.post(`/fn/${gardenId}/accept`, {
      data: { username: b.username, displayName: 'The Neighbour' },
    });
    expect(accepted.ok()).toBe(true);
    expect(await accepted.json()).toMatchObject({ status: 'active', role: 'member' });
    const shared = await b.api.post(`/fn/${gardenId}/share`, {
      data: { cruxId: 'seed-swap', title: 'Seed swap list', url: 'https://example.com/seeds' },
    });
    expect(shared.ok()).toBe(true);
    // …but cannot promote themselves by writing the Store around the functions.
    const forged = await b.api.put(`/store/${gardenId}/members%2F${b.authorId}`, {
      data: { value: { role: 'owner' }, mode: 'public' },
    });
    expect(forged.status()).toBe(403);

    // Everyone sees the same garden.
    const members = (await (await owner.post(`/fn/${gardenId}/members`, { data: {} })).json()) as {
      username: string;
      role: string;
      status: string;
    }[];
    expect(members).toEqual([
      expect.objectContaining({ username: 'owner', role: 'owner', status: 'active' }),
      expect.objectContaining({ username: b.username, role: 'member', status: 'active' }),
    ]);
    const shelf = (await (await owner.post(`/fn/${gardenId}/shelf`, { data: {} })).json()) as {
      title: string;
      authorUsername: string;
    }[];
    expect(shelf).toEqual([
      expect.objectContaining({ title: 'Seed swap list', authorUsername: b.username }),
    ]);
    // The owner's Home lists it, with their role.
    await page.locator('header').getByRole('button').first().click();
    const gardens = page.getByTestId('gardens-section');
    await expect(gardens).toBeVisible({ timeout: 30_000 });
    await expect(gardens.getByTestId(`garden-${gardenId}`)).toContainText('owner');
    await page.screenshot({ path: 'e2e/.results/garden-members.png' });
    await owner.dispose();
    await b.api.dispose();
  } finally {
    await app.close();
  }
});

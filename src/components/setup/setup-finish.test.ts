import { describe, expect, it, vi } from 'vitest';
import { aiDecision, applySetup, type SetupDeps } from './setup-finish';
import { initialChoices, type SetupChoices } from './setup-store';

function fakeDeps(
  overrides: Partial<{ username: string | null; title: string; ai: string | null }> = {},
) {
  const calls: string[] = [];
  const deps: SetupDeps = {
    ensureAuthor: vi.fn(async () => calls.push('ensureAuthor')),
    currentUsername: () => overrides.username ?? 'wanderer-1234',
    updateUsername: vi.fn(async (name: string) => calls.push(`username:${name}`)),
    uploadPhoto: vi.fn(async () => calls.push('photo')),
    garden: () => ({ id: 'root', title: overrides.title ?? 'My Garden' }),
    renameGarden: vi.fn(async (_id: string, title: string) => {
      calls.push(`rename:${title}`);
    }),
    aiSetting: () => overrides.ai ?? null,
    setAiEnabled: vi.fn((on: boolean) => calls.push(`ai:${on}`)),
    wearMood: vi.fn(async (id: string) => {
      calls.push(`mood:${id}`);
    }),
    defaultMoodId: 'plasma',
    rememberNeed: vi.fn((need: string) => calls.push(`need:${need}`)),
    setAdvancedMode: vi.fn((on: boolean) => calls.push(`advanced:${on}`)),
  };
  return { deps, calls };
}

const first = (patch: Partial<SetupChoices> = {}): SetupChoices => ({
  ...initialChoices({ mode: 'first', aiAtStart: null, moodAtStart: 'plasma' }),
  ...patch,
});

describe('applying setup', () => {
  it('saves Advanced Mode independently of AI and preserves it when setup did not change it', async () => {
    const { deps } = fakeDeps({ ai: 'false' });
    await applySetup(first({ advancedMode: true, noAi: true }), deps);
    expect(deps.setAdvancedMode).toHaveBeenCalledWith(true);
    expect(deps.setAiEnabled).not.toHaveBeenCalled();
    vi.mocked(deps.setAdvancedMode).mockClear();
    await applySetup(first({ advancedMode: true, advancedModeAtStart: true, noAi: true }), deps);
    expect(deps.setAdvancedMode).not.toHaveBeenCalled();
    await applySetup(first({ advancedModeAtStart: true, advancedMode: false, noAi: true }), deps);
    expect(deps.setAdvancedMode).toHaveBeenCalledWith(false);
    expect(deps.setAiEnabled).not.toHaveBeenCalled();
  });
  it('Skip setup from step 1 plants the garden with the defaults and nothing else', async () => {
    const { deps, calls } = fakeDeps();
    const outcome = await applySetup(first(), deps);
    // A new garden wears the Default Mood, as planting always did; AI stays as the product sets it.
    expect(calls).toEqual(['ensureAuthor', 'mood:plasma']);
    expect(outcome).toEqual({
      usernameChanged: false,
      gardenRenamed: false,
      ai: null,
      moodWorn: 'plasma',
    });
  });

  it('the full path applies every choice through the same services', async () => {
    const { deps, calls } = fakeDeps({ ai: 'true' });
    const photo = new File(['x'], 'me.png', { type: 'image/png' });
    await applySetup(
      first({
        need: 'website',
        gardenName: '  Moss Hollow ',
        username: 'river',
        photo,
        noAi: true,
        moodId: 'parchment',
      }),
      deps,
    );
    expect(calls).toEqual([
      'ensureAuthor',
      'username:river',
      'photo',
      'rename:Moss Hollow',
      'ai:false',
      'mood:parchment',
      'need:website',
    ]);
  });

  it('turns collaboration on only when something was set up', () => {
    const base = { noAi: false, aiUsed: false, aiAtStart: null };
    expect(aiDecision(base, null)).toBeNull();
    expect(aiDecision({ ...base, aiUsed: true }, null)).toBe(true);
    expect(aiDecision({ ...base, aiUsed: true }, 'true')).toBeNull();
    expect(aiDecision({ ...base, aiAtStart: 'false' }, 'false')).toBeNull();
    expect(aiDecision({ ...base, noAi: true }, 'true')).toBe(false);
    expect(aiDecision({ ...base, noAi: true }, 'false')).toBeNull();
  });

  it('running again never wipes: empty fields and an unchanged Mood leave everything as it is', async () => {
    const { deps, calls } = fakeDeps({ username: 'river', title: 'Studio', ai: 'true' });
    const again: SetupChoices = {
      ...initialChoices({
        mode: 'again',
        need: 'music',
        gardenName: 'Studio',
        username: 'river',
        aiAtStart: 'true',
        moodAtStart: 'night-city',
      }),
    };
    await applySetup({ ...again, username: '', gardenName: '   ' }, deps);
    expect(calls).toEqual(['ensureAuthor', 'need:music']);
    await applySetup({ ...again, moodId: 'night-city' }, deps);
    expect(calls.filter((c) => c.startsWith('mood:'))).toEqual([]);
    expect(deps.updateUsername).not.toHaveBeenCalled();
    expect(deps.renameGarden).not.toHaveBeenCalled();
    expect(deps.setAiEnabled).not.toHaveBeenCalled();
  });

  it('a Mood that cannot be worn does not stop the garden opening', async () => {
    const { deps } = fakeDeps();
    deps.wearMood = vi.fn(async () => {
      throw new Error('no blob store');
    });
    await expect(applySetup(first({ moodId: 'parchment' }), deps)).resolves.toMatchObject({
      moodWorn: null,
    });
  });
});

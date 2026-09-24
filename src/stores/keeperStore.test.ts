import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initServices, getServices } from '@/services';
import { loadGardenCollaboration } from '@/services/garden-collaboration';
import { getSqliteClient } from '@/services/sqlite/client';
import { useGardenContext } from './gardenContext';
import { createKeeperStore } from './keeperStore';
import { runConversation } from '@/ai/engine';
import { getApiKey } from '@/ai/keys';
import { runGardenTool } from '@/ai/garden-tools';

vi.mock('@/ai/keys', () => ({ getApiKey: vi.fn(async () => 'test-key') }));
vi.mock('@/ai/engine', () => ({ runConversation: vi.fn() }));
vi.mock('@/ai/garden-tools', async (original) => ({
  ...(await original<typeof import('@/ai/garden-tools')>()),
  runGardenTool: vi.fn(async () => 'planted'),
}));

async function garden(title: string) {
  const crux = await getServices().crux.create({ title, kind: 'garden' });
  const keeper = createKeeperStore(crux.id);
  await keeper.store.getState().load();
  return { ...keeper, crux };
}

describe('Garden conversation lifetimes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await initServices('local');
  });

  it('captures the conversation and creation destination before key lookup while another Garden is opened', async () => {
    const a = await garden('Studio');
    const b = await garden('Writing');
    let release!: (key: string) => void;
    vi.mocked(getApiKey).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    vi.mocked(runConversation).mockImplementation(async function* (...args) {
      await args[4]!('call_garden_tool', {
        name: 'plant_crux',
        input: { title: 'Original destination' },
      });
      yield { type: 'text', content: 'Created in Studio.' };
    });
    a.store.getState().setDraft('Make a thing');
    const turn = a.store.getState().send('Make a thing');
    const target = a.store.getState().activeId;
    const duplicate = a.store.getState().send('Should not be admitted');
    useGardenContext.getState().select(b.crux);
    a.store.getState().newConversation();
    b.store.getState().setDraft('Writing draft');
    release('test-key');
    await Promise.all([turn, duplicate]);
    await a.store.getState().flush();
    const saved = await loadGardenCollaboration(a.crux.id);
    expect(
      saved.conversations.find((c) => c.id === target)?.messages.map((m) => m.content),
    ).toEqual(['Make a thing', 'Created in Studio.']);
    expect(saved.conversations.find((c) => c.id !== target)?.messages).toEqual([]);
    expect(vi.mocked(runGardenTool)).toHaveBeenCalledWith(
      'plant_crux',
      {
        title: 'Original destination',
        gardenId: a.crux.id,
      },
      'agent:The Keeper',
    );
    expect(vi.mocked(runConversation)).toHaveBeenCalledTimes(1);
    expect((await loadGardenCollaboration(b.crux.id)).conversations).toEqual([]);
    expect(b.store.getState().draft).toBe('Writing draft');
  });

  it('refuses provider work on a failed save, preserves the draft and retries persistence', async () => {
    const a = await garden('Studio');
    const db = getSqliteClient();
    await db.run(
      "CREATE TRIGGER fail_conversation BEFORE UPDATE ON cruxes BEGIN SELECT RAISE(ABORT, 'Disk unavailable'); END",
    );
    a.store.getState().setDraft('Do not lose my prompt');
    await a.store.getState().send('Do not lose my prompt');
    expect(runConversation).not.toHaveBeenCalled();
    expect(a.store.getState().draft).toBe('Do not lose my prompt');
    expect(a.store.getState().saveError).toContain('Disk unavailable');
    expect((await loadGardenCollaboration(a.crux.id)).conversations).toEqual([]);
    await db.run('DROP TRIGGER fail_conversation');
    await a.store.getState().flush();
    expect(a.store.getState().dirty).toBe(false);
    expect((await loadGardenCollaboration(a.crux.id)).conversations[0]?.messages[0]?.content).toBe(
      'Do not lose my prompt',
    );
    vi.mocked(runConversation).mockImplementation(async function* () {
      yield { type: 'text', content: 'Now saved.' };
    });
    await a.store.getState().send('Do not lose my prompt');
    expect(
      (await loadGardenCollaboration(a.crux.id)).conversations[0]?.messages.map((m) => m.content),
    ).toEqual(['Do not lose my prompt', 'Now saved.']);
  });

  it('retains one reply after the final write fails and a retry succeeds', async () => {
    const a = await garden('Studio');
    const db = getSqliteClient();
    vi.mocked(runConversation).mockImplementation(async function* () {
      yield { type: 'text', content: 'Keep this exactly once.' };
      await db.run(
        "CREATE TRIGGER fail_reply BEFORE UPDATE ON cruxes BEGIN SELECT RAISE(ABORT, 'Reply save refused'); END",
      );
    });
    await a.store.getState().send('Answer');
    expect(a.store.getState().saveError).toContain('Reply save refused');
    await db.run('DROP TRIGGER fail_reply');
    await a.store.getState().flush();
    const saved = await loadGardenCollaboration(a.crux.id);
    expect(saved.conversations[0]?.messages.map((m) => m.content)).toEqual([
      'Answer',
      'Keep this exactly once.',
    ]);
  });

  it('stops only its own turn, saves the partial reply, and cannot delete a running conversation', async () => {
    const a = await garden('Studio');
    vi.mocked(runConversation).mockImplementation(async function* (...args) {
      yield { type: 'text', content: 'Partial reply.' };
      await new Promise<void>((resolve) =>
        args[5]!.addEventListener('abort', () => resolve(), { once: true }),
      );
    });
    const turn = a.store.getState().send('Begin');
    await vi.waitFor(() => expect(a.store.getState().streamContent).toBe('Partial reply.'));
    a.store.getState().deleteConversation(a.store.getState().activeId!);
    expect(a.store.getState().conversations).toHaveLength(1);
    await a.stopAndFlush();
    await turn;
    const saved = await loadGardenCollaboration(a.crux.id);
    expect(saved.conversations[0]?.messages[1]?.content).toContain('Partial reply.');
    expect(saved.conversations[0]?.messages[1]?.content).toContain('Stopped here');
    expect(a.store.getState().streaming).toBe(false);
  });
});

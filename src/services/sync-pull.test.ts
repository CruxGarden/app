import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ activeId: 'a' as string | null, open: true }));
const api = vi.hoisted(() => ({ pullCrux: vi.fn() }));
const io = vi.hoisted(() => ({ peekImport: vi.fn(), importCrux: vi.fn() }));
const registry = vi.hoisted(() => ({
  activateWorkspace: vi.fn(),
  closeCruxWorkspaces: vi.fn(),
  openWorkspace: vi.fn(),
}));
vi.mock('@/api/sync', () => api);
vi.mock('./crux-io', () => io);
vi.mock('@/stores/workspaceRegistry', () => ({
  ...registry,
  getWorkspace: () => (state.open ? {} : undefined),
  useWorkspaceRegistry: { getState: () => state },
}));
import { pullCrux, useSyncPull } from './sync-pull';

describe('pulling a Crux without reloading the garden', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.activeId = 'a';
    state.open = true;
    useSyncPull.setState({}, true);
    api.pullCrux.mockResolvedValue(new Blob(['archive']));
    io.peekImport.mockResolvedValue({ cruxData: { id: 'a' } });
    registry.closeCruxWorkspaces.mockImplementation(async () => {
      state.open = false;
      state.activeId = null;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rejects a different Crux before closing workspaces or importing', async () => {
    io.peekImport.mockResolvedValue({ cruxData: { id: 'b' } });
    await pullCrux('a');
    expect(registry.closeCruxWorkspaces).not.toHaveBeenCalled();
    expect(io.importCrux).not.toHaveBeenCalled();
    expect(useSyncPull.getState().a!.error).toBe('Pull failed');
  });

  it('saves and closes writers before replacing, then reopens the affected Crux', async () => {
    io.importCrux.mockImplementation(async () => {
      expect(state.open).toBe(false);
    });
    await pullCrux('a');
    expect(registry.closeCruxWorkspaces).toHaveBeenCalledWith('a', 'save');
    expect(registry.openWorkspace).toHaveBeenCalledWith('a');
    expect(registry.activateWorkspace).toHaveBeenCalledWith('a');
    expect(useSyncPull.getState().a).toEqual({ busy: false, message: 'Pull complete', error: '' });
  });

  it('reopens after import failure and keeps the failure visible', async () => {
    io.importCrux.mockRejectedValue(new Error('Invalid archive'));
    await pullCrux('a');
    expect(registry.openWorkspace).toHaveBeenCalledWith('a');
    expect(useSyncPull.getState().a!.error).toBe('Pull failed');
  });

  it('does not steal focus when the person switches to another Crux during import', async () => {
    io.importCrux.mockImplementation(async () => {
      state.activeId = 'b';
    });
    await pullCrux('a');
    expect(registry.openWorkspace).toHaveBeenCalledWith('a');
    expect(registry.activateWorkspace).not.toHaveBeenCalled();
  });
});

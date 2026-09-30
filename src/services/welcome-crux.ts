import { getServices } from './index';
import { applyTemplateToCrux } from './crux-create';
import { gardenMembers } from './garden-navigation';

const marker = 'home-page-v1';
const pending = new Map<string | undefined, Promise<string>>();

/** Called only by new-Garden setup, never by startup, import or recovery. */
export function seedWelcomeCrux(gardenId?: string): Promise<string> {
  const current = pending.get(gardenId);
  if (current) return current;
  const result = seed(gardenId).finally(() => {
    pending.delete(gardenId);
  });
  pending.set(gardenId, result);
  return result;
}

async function seed(gardenId?: string): Promise<string> {
  const { crux } = getServices();
  const members = gardenId ? await gardenMembers(gardenId) : await crux.listAll();
  const existing = members.find((item) => item.meta?.welcome === marker);
  if (existing?.meta?.template === 'hello-world') return existing.id;
  // Keep an unfinished creation discoverable for a retry. Never reapply a
  // completed template: its files now belong to the person, including edits.
  const project =
    existing ??
    (await crux.create({
      title: 'Hello, world',
      description: 'Your first home page — add your name and photo, preview it, and share.',
      type: 'workspace',
      kind: 'webapp',
      ...(gardenId ? { gardenId } : {}),
      meta: { welcome: marker, messages: [] },
    }));
  await applyTemplateToCrux(project, 'hello-world', 'webapp');
  return project.id;
}

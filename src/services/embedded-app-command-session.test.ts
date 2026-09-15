import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCommandSession } from '../../embedded-apps/shared/command-session.js';

describe('embedded editor command lifecycle', () => {
  it('serializes complete commands and returns settled, confirmed state', async () => {
    const events: string[] = [];
    let state = 0;
    const session = createCommandSession<string>({
      settle: async () => {
        events.push('settle');
      },
      save: async () => {
        events.push(`save:${state}`);
      },
      prepare: (command) => ({
        mutates: command !== 'inspect',
        apply: async () => {
          events.push(command);
          if (command !== 'inspect') state++;
        },
        result: () => state,
      }),
    });
    expect(
      await Promise.all([
        session.execute('first'),
        session.execute('second'),
        session.execute('inspect'),
      ]),
    ).toEqual([1, 2, 2]);
    expect(events).toEqual([
      'settle',
      'save:0',
      'first',
      'settle',
      'save:1',
      'settle',
      'save:1',
      'second',
      'settle',
      'save:2',
      'settle',
      'inspect',
      'settle',
    ]);
  });

  it('rejects invalid input without saving or editing; the next command can run', async () => {
    let writes = 0;
    const session = createCommandSession<boolean>({
      settle() {},
      save() {
        writes++;
      },
      prepare(valid) {
        if (!valid) throw new Error('Unknown element');
        return {
          mutates: true,
          apply() {
            writes++;
          },
        };
      },
    });
    await expect(session.execute(false)).rejects.toThrow('Unknown element');
    expect(writes).toBe(0);
    await session.execute(true);
    expect(writes).toBe(3);
  });

  it.each([1, 2])(
    'does not claim success when save %i fails, or automatically replay a mutation',
    async (failedSave) => {
      let saves = 0;
      let edits = 0;
      const session = createCommandSession({
        settle() {},
        save() {
          if (++saves === failedSave) throw new Error('Save conflict');
        },
        prepare: () => ({
          mutates: true,
          apply() {
            edits++;
          },
        }),
      });
      await expect(session.execute({})).rejects.toThrow('Save conflict');
      expect(edits).toBe(failedSave === 1 ? 0 : 1);
      await session.execute({});
      expect(edits).toBe(failedSave === 1 ? 1 : 2);
    },
  );

  it('does not apply while hydration or native work is failing', async () => {
    let applied = false;
    const session = createCommandSession({
      settle() {
        throw new Error('Editor is opening');
      },
      save() {},
      prepare: () => ({
        mutates: true,
        apply() {
          applied = true;
        },
      }),
    });
    await expect(session.execute({})).rejects.toThrow('Editor is opening');
    expect(applied).toBe(false);
  });
});

it('ships the same standalone shared source with adopting embeds', () => {
  for (const app of [
    'pptist',
    'minipaint',
    'jupyterlite',
    'piskel',
    'blockbench',
    'rawgraphs',
    'audiomass',
    'kan',
  ])
    for (const file of [
      'command-session.js',
      'command-session.d.ts',
      'project-image.js',
      'project-image.d.ts',
      'project-file.js',
      'project-file.d.ts',
    ]) {
      expect(
        readFileSync(
          new URL(
            `../../${app}-crux/${['piskel', 'rawgraphs', 'audiomass'].includes(app) ? 'src/' : ''}garden/shared/${file}`,
            import.meta.url,
          ),
          'utf8',
        ),
      ).toBe(readFileSync(new URL(`../../embedded-apps/shared/${file}`, import.meta.url), 'utf8'));
    }
});

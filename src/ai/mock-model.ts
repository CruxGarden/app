import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import type { LanguageModel } from 'ai';
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';

/**
 * The scripted language model the e2e suite talks to (CRUX_AI_MOCK=1).
 *
 * Deterministic and provider-free, so the whole Collaboration loop — prompt
 * assembly, tool execution against the real store and Project Folder,
 * streaming into the UI, auto-snapshot — runs in Playwright without a key.
 *
 * Script: a user message containing "write" makes the model call
 * `write_file` (hello.txt); "paint" makes it call `set_theme` (preview);
 * once it sees a tool result it answers with text. Anything else is echoed. Never used outside the mock flag.
 *
 * `doGenerate` (non-streaming calls) answers the verify-before-done
 * inspection (B4) with a scripted verdict — see `verdictFor` at the end of
 * this file — and any other generateText call with a short fixed text.
 */

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function stream(parts: LanguageModelV4StreamPart[]) {
  return {
    stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
      { type: 'stream-start', warnings: [] },
      ...parts,
    ]),
  };
}

function textStream(text: string) {
  return stream([
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: USAGE },
  ]);
}

function toolCallStream(toolName: string, input: Record<string, unknown>) {
  return stream([
    { type: 'tool-call', toolCallId: `mock-${Date.now()}`, toolName, input: JSON.stringify(input) },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: USAGE },
  ]);
}

function lastUserText(prompt: LanguageModelV4Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i]!;
    if (m.role === 'user') {
      return m.content.map((c) => (c.type === 'text' ? c.text : '')).join(' ');
    }
  }
  return '';
}

let instance: MockLanguageModelV4 | null = null;

export function getMockLanguageModel(): LanguageModel {
  if (!instance) {
    instance = new MockLanguageModelV4({
      doGenerate: async ({ prompt }) => ({
        content: [{ type: 'text', text: generateText(prompt) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: USAGE,
        warnings: [],
      }),
      doStream: async ({ prompt, abortSignal }) => {
        const miniPaintCall = (name: string, input: Record<string, unknown>) => {
          let token: string | undefined;
          for (const message of [...prompt].reverse()) {
            if (message.role !== 'tool') continue;
            for (const result of [...message.content].reverse()) {
              if (result.type !== 'tool-result' || !result.toolName.includes('minipaint')) continue;
              const output = result.output;
              const value =
                output.type === 'text' || output.type === 'error-text'
                  ? output.value
                  : output.type === 'json' || output.type === 'error-json'
                    ? JSON.stringify(output.value)
                    : '';
              token = value.match(/"stateToken"\s*:\s*"([^"\n]+)"/)?.[1];
              if (token) break;
            }
            if (token) break;
          }
          return toolCallStream(name, {
            ...(name !== 'inspect_minipaint' && token ? { expectedState: token } : {}),
            ...input,
          });
        };

        if (lastUserText(prompt).includes('[cruxspace:cover]')) {
          const last = prompt.at(-1);
          const used = (name: string) =>
            last?.role === 'tool' &&
            last.content.some((c) => c.type === 'tool-result' && c.toolName === name);
          if (used('use_cruxspace_asset'))
            return textStream('Done — copied the selected Cruxspace artwork.');
          if (used('list_cruxspace_assets')) {
            const data = JSON.parse(toolResultText(prompt, 'list_cruxspace_assets') || '{}');
            const space = data.spaces?.find((s: { assets: unknown[] }) => s.assets.length);
            const asset = space?.assets[0];
            if (!asset) return textStream('No Cruxspace artwork is available.');
            return toolCallStream('use_cruxspace_asset', {
              spaceId: space.id,
              sourceCruxId: asset.sourceCruxId,
              outputId: asset.id,
              fingerprint: asset.fingerprint,
              path: 'assets/agent-cover.png',
            });
          }
          return toolCallStream('list_cruxspace_assets', {});
        }
        const eventAction = lastUserText(prompt).match(/\[gdevelop:event-([a-z-]+)\]/)?.[1];
        if (eventAction) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length && eventAction !== 'stale')
            return toolCallStream('inspect_gdevelop_events', { scene: 'Scene' });
          if (eventAction === 'inspect' || rounds.length >= (eventAction === 'stale' ? 1 : 2))
            return textStream('GDevelop event ' + eventAction + ' complete.');
          const raw = toolResultText(prompt, 'inspect_gdevelop_events') || '';
          const expectedState = /"expectedState":"([a-f0-9]{64})"/.exec(raw)?.[1];
          if (!expectedState) return textStream('Event inspection unavailable.');
          const base = { scene: 'Scene', expectedState };
          if (['undo', 'redo'].includes(eventAction))
            return toolCallStream('gdevelop_event_history', { ...base, direction: eventAction });
          const edits: Record<string, Record<string, unknown>> = {
            comment: {
              action: 'insert',
              parent: [],
              index: 0,
              kind: 'comment',
              text: 'Movement notes',
            },
            group: {
              action: 'insert',
              parent: [],
              index: 1,
              kind: 'group',
              text: 'Movement rules',
            },
            standard: { action: 'insert', parent: [1], index: 0, kind: 'standard', disabled: true },
            stale: { action: 'update', eventPath: [0], text: 'This must not overwrite the person' },
            duplicate: { action: 'duplicate', eventPath: [1, 0], parent: [1], index: 1 },
            move: { action: 'move', eventPath: [1, 1], parent: [], index: 2 },
            remove: { action: 'remove', eventPath: [2] },
            rename: { action: 'update', eventPath: [1], text: 'Revised movement rules' },
            activate: { action: 'update', eventPath: [1, 0], disabled: false },
          };
          if (edits[eventAction])
            return toolCallStream('edit_gdevelop_event', { ...base, ...edits[eventAction] });
          if (eventAction === 'action')
            return toolCallStream('edit_gdevelop_instruction', {
              ...base,
              eventPath: [1, 0],
              list: 'actions',
              instructionPath: [0],
              action: 'insert',
              instruction: { type: 'MettreX', parameters: ['NewSprite', '=', '123'] },
            });
          if (['condition', 'revise', 'start', 'delete-condition'].includes(eventAction))
            return toolCallStream('edit_gdevelop_instruction', {
              ...base,
              eventPath: [1, 0],
              list: 'conditions',
              instructionPath: [0],
              action:
                eventAction === 'condition'
                  ? 'insert'
                  : ['revise', 'start'].includes(eventAction)
                    ? 'update'
                    : 'remove',
              ...(eventAction === 'delete-condition'
                ? {}
                : {
                    instruction: {
                      type: 'DepartScene',
                      parameters: [''],
                      inverted: eventAction === 'revise',
                    },
                  }),
            });
          return textStream('Unknown event test action.');
        }
        const objectAction = lastUserText(prompt).match(/\[gdevelop:object-([a-z-]+)\]/)?.[1];
        if (objectAction) {
          const rounds = toolResultsThisTurn(prompt);
          const base = { scene: 'Scene', object: 'NewSprite', scope: 'scene' };
          if (!rounds.length && objectAction !== 'stale')
            return toolCallStream('inspect_gdevelop_object', {
              ...base,
              section: objectAction === 'animation' ? 'animations' : 'behaviors',
            });
          const raw = toolResultText(prompt, 'inspect_gdevelop_object') || '{}';
          if (raw.startsWith('Error')) return textStream('Object inspection failed: ' + raw);
          if (objectAction === 'stale') {
            if (rounds.length) return textStream('GDevelop object stale complete.');
            // Older results are shortened to head/tail text by buildNormalizedMessages.
            // This deliberate stale test needs only the retained identity and token.
            const expectedState = /"expectedState":"([a-f0-9]{64})"/.exec(raw)?.[1];
            const behavior = /"behavior":("(?:[^"\\]|\\.)*")/.exec(raw)?.[1];
            if (!expectedState || !behavior)
              return textStream('Earlier object identity is unavailable.');
            return toolCallStream('edit_gdevelop_properties', {
              ...base,
              expectedState,
              behavior: JSON.parse(behavior),
              updates: [
                { name: 'MaxSpeed', value: 420 },
                { name: 'AllowDiagonals', value: false },
              ],
            });
          }
          const info = JSON.parse(raw);
          if (rounds.length === 1 && ['inspect', 'edit'].includes(objectAction)) {
            const behavior = info.items?.find((b: { type?: string }) =>
              b.type?.includes('TopDownMovement'),
            )?.name;
            if (!behavior) return textStream('No movement behavior found.');
            return toolCallStream('inspect_gdevelop_object', {
              ...base,
              section: 'properties',
              behavior,
            });
          }
          if (objectAction === 'animation' && rounds.length === 1)
            return toolCallStream('edit_gdevelop_animation', {
              ...base,
              expectedState: info.expectedState,
              animation: 0,
              fps: 12,
              loop: false,
            });
          if (objectAction === 'edit' && rounds.length === 2)
            return toolCallStream('edit_gdevelop_properties', {
              ...base,
              expectedState: info.expectedState,
              behavior: info.behavior,
              updates: [
                { name: 'MaxSpeed', value: 420 },
                { name: 'AllowDiagonals', value: false },
              ],
            });
          return textStream('GDevelop object ' + objectAction + ' complete.');
        }
        const sceneAction = lastUserText(prompt).match(/\[gdevelop:scene-([a-z-]+)\]/)?.[1];
        if (sceneAction) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length && sceneAction !== 'stale')
            return toolCallStream('inspect_gdevelop_scene', { scene: 'Scene' });
          if (
            (sceneAction === 'stale' && !rounds.length) ||
            (sceneAction !== 'stale' && rounds.length === 1)
          ) {
            const raw = toolResultText(prompt, 'inspect_gdevelop_scene') || '{}';
            if (raw.startsWith('Error')) return textStream('Scene inspection failed: ' + raw);
            const inspected = JSON.parse(raw);
            const base = { scene: 'Scene', expectedState: inspected.expectedState };
            const id = inspected.instances[0].id;
            if (sceneAction === 'select')
              return toolCallStream('select_gdevelop_instances', { ...base, ids: [id] });
            if (sceneAction === 'edit' || sceneAction === 'stale')
              return toolCallStream('edit_gdevelop_instances', {
                ...base,
                updates: [{ id, x: 123, width: 96, height: 80, opacity: 200 }],
              });
            if (sceneAction === 'add')
              return toolCallStream('add_gdevelop_instance', {
                scene: 'Scene',
                object: inspected.instances[0].object,
                x: 300,
                y: 200,
              });
            if (sceneAction === 'duplicate')
              return toolCallStream('duplicate_gdevelop_instances', {
                ...base,
                ids: [id],
                dx: 100,
                dy: 0,
              });
            if (sceneAction === 'delete')
              return toolCallStream('delete_gdevelop_instances', {
                ...base,
                ids: [inspected.instances[inspected.instances.length - 1].id],
              });
            if (sceneAction === 'undo' || sceneAction === 'redo')
              return toolCallStream('gdevelop_scene_history', { ...base, direction: sceneAction });
          }
          return textStream('GDevelop scene ' + sceneAction + ' complete.');
        }
        if (lastUserText(prompt).includes('[gdevelop:inspect]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_gdevelop', {});
          // Deliberately scripted integration coverage, not a real-model evaluation.
          const overview = JSON.parse(toolResultText(prompt, 'inspect_gdevelop') || '{}');
          const scene = overview.scenes?.[0]?.name || overview.scene;
          if (rounds.length === 1)
            return toolCallStream('inspect_gdevelop', { scene, section: 'objects', limit: 5 });
          if (rounds.length === 2)
            return toolCallStream('inspect_gdevelop', { scene, section: 'instances', limit: 5 });
          if (rounds.length === 3)
            return toolCallStream('read_gdevelop_content', {
              path: overview.path.replace(/\/instances$/, '/objects/0/behaviors'),
            });
          if (rounds.length === 4)
            return toolCallStream('list_gdevelop_capabilities', {
              kind: 'action',
              query: 'sound',
              limit: 5,
            });
          if (rounds.length === 5)
            return toolCallStream('list_gdevelop_capabilities', {
              kind: 'action',
              type: 'PlaySound',
            });
          if (rounds.length === 6)
            return toolCallStream('list_gdevelop_capabilities', {
              kind: 'condition',
              type: 'CollisionNP',
            });
          return textStream('GDevelop inspection complete.');
        }
        if (lastUserText(prompt).includes('[gdevelop:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_gdevelop', {});
          if (rounds.length === 1)
            return toolCallStream('set_gdevelop_background', { scene: 'Scene', rgb: [32, 48, 64] });
          if (rounds.length === 2)
            return toolCallStream('set_gdevelop_name', { name: 'Garden game' });
          return textStream('Named the game and changed the native scene background.');
        }
        // ── Glow Garden: the scripted collaborator across the game Cruxspace (GAME-CRUXSPACE-PLAN.md) ──
        const creativeGame = creativeGameScript(prompt);
        if (creativeGame) return creativeGame;
        const game = gameScript(prompt);
        if (game) return game;
        const business = businessScript(prompt);
        if (business) return business;
        const research = researchScript(prompt);
        if (research) return research;

        const moqiraDepth = lastUserText(prompt).match(/\[moqira:depth-([a-z-]+)\]/)?.[1];
        if (moqiraDepth) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_moqira', {});
          if (moqiraDepth === 'draft') return textStream('Moqira depth draft complete.');
          const inspected = JSON.parse(toolResultText(prompt, 'inspect_moqira') || '{}');
          const wireframeId = inspected.wireframes[0].id;
          if (rounds.length === 1) return toolCallStream('read_moqira_wireframe', { wireframeId });
          const screen = JSON.parse(toolResultText(prompt, 'read_moqira_wireframe') || '{}');
          if (rounds.length === 2) {
            const expectedState = screen.stateToken;
            const title = screen.components.find((c: { kind: string }) => c.kind === 'textTitle');
            const button = screen.components.find((c: { kind: string }) => c.kind === 'button');
            if (moqiraDepth === 'catalogue')
              return toolCallStream('list_moqira_components', { query: 'button', limit: 5 });
            if (moqiraDepth === 'create')
              return toolCallStream('add_moqira_components', {
                wireframeId,
                expectedState,
                components: [
                  {
                    kind: 'textTitle',
                    properties: {
                      text: 'Bloom & Ink',
                      name: 'Hero',
                      x: 60,
                      y: 60,
                      width: 460,
                      height: 60,
                      fontSize: 36,
                    },
                  },
                  {
                    kind: 'textParagraph',
                    properties: {
                      text: 'Handmade paper goods for everyday ideas.',
                      x: 60,
                      y: 140,
                      width: 470,
                      height: 60,
                    },
                  },
                  {
                    kind: 'button',
                    properties: {
                      text: 'Explore the collection',
                      x: 60,
                      y: 235,
                      width: 220,
                      height: 45,
                    },
                  },
                ],
              });
            if (moqiraDepth === 'revise')
              return toolCallStream('update_moqira_components', {
                wireframeId,
                expectedState,
                patches: [{ id: title.id, properties: { width: 540, x: 70 } }],
              });
            if (moqiraDepth === 'screen')
              return toolCallStream('create_moqira_wireframe', {
                name: 'Collection',
                expectedState,
              });
            if (moqiraDepth === 'link')
              return toolCallStream('set_moqira_link', {
                wireframeId,
                id: button.id,
                key: 'whole',
                link: { kind: 'wireframe', wireframeId: inspected.wireframes[1].id },
                expectedState,
              });
            if (moqiraDepth === 'home')
              return toolCallStream('set_moqira_view', {
                wireframeId,
                interactive: false,
                expectedState,
              });
            if (moqiraDepth === 'play')
              return toolCallStream('set_moqira_view', {
                wireframeId,
                interactive: true,
                expectedState,
              });
            if (moqiraDepth === 'duplicate')
              return toolCallStream('duplicate_moqira_components', {
                wireframeId,
                ids: [button.id],
                expectedState,
              });
            if (moqiraDepth === 'undo' || moqiraDepth === 'redo')
              return toolCallStream('moqira_history', { direction: moqiraDepth, expectedState });
            if (moqiraDepth === 'image')
              return toolCallStream('add_moqira_image', {
                wireframeId,
                path: 'brand.png',
                x: 60,
                y: 340,
                width: 80,
                height: 80,
                expectedState,
              });
            if (moqiraDepth === 'export')
              return toolCallStream('save_moqira_project', { label: 'Editable shop design' });
          }
          return textStream('Moqira depth ' + moqiraDepth + ' complete.');
        }
        const calendarDepth = lastUserText(prompt).match(/\[calendar:depth-([a-z-]+)\]/)?.[1];
        if (calendarDepth) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_calendar', {});
          if (calendarDepth === 'draft') return textStream('Calendar depth draft complete.');
          const inspected = JSON.parse(toolResultText(prompt, 'inspect_calendar') || '{}');
          if (rounds.length === 1) {
            const expectedState = inspected.stateToken;
            const id = inspected.events.find(
              (e: { title: string }) => !e.title.includes('Follow-up'),
            )?.id;
            if (calendarDepth === 'create')
              return toolCallStream('add_calendar_event', {
                title: 'Launch review',
                start: '2026-09-15T10:00:30',
                end: '2026-09-15T11:30:30',
                notes: 'Original note',
                color: '#663399',
              });
            if (calendarDepth === 'revise')
              return toolCallStream('update_calendar_event', {
                id,
                start: '2026-09-16T14:00:30',
                end: '2026-09-16T15:30:30',
                expectedState,
              });
            if (calendarDepth === 'duplicate')
              return toolCallStream('duplicate_calendar_event', {
                id,
                start: '2026-09-18T09:00:30',
                title: 'Follow-up review',
                expectedState,
              });
            if (calendarDepth === 'view')
              return toolCallStream('set_calendar_view', {
                view: 'listWeek',
                date: '2026-09-16',
                expectedState,
              });
            if (calendarDepth === 'export')
              return toolCallStream('save_calendar_csv', { label: 'Launch schedule' });
            if (calendarDepth === 'read') return toolCallStream('read_calendar_event', { id });
            if (calendarDepth === 'remove')
              return toolCallStream('remove_calendar_event', {
                id: inspected.events.find((e: { title: string }) => e.title.includes('Follow-up'))
                  .id,
              });
          }
          return textStream('Calendar depth ' + calendarDepth + ' complete.');
        }
        if (lastUserText(prompt).includes('[calendar:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_calendar', {});
          if (rounds.length === 1)
            return toolCallStream('add_calendar_event', {
              title: 'Garden launch review',
              start: '2026-09-15T10:00:00',
              end: '2026-09-15T11:00:00',
            });
          if (rounds.length === 2)
            return toolCallStream('set_calendar_name', { name: 'Launch calendar' });
          return textStream('Added Garden launch review and named the calendar Launch calendar.');
        }
        if (lastUserText(prompt).includes('[am1:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_am1', {});
          if (rounds.length === 1) return toolCallStream('set_am1_tempo', { tempo: 96 });
          if (rounds.length === 2)
            return toolCallStream('set_am1_key', { key: 'D', scale: 'dorian' });
          return textStream('Set the tempo to 96 and the key to D dorian.');
        }
        if (lastUserText(prompt).includes('[bentopdf:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_bentopdf', {});
          if (rounds.length === 1)
            return toolCallStream('set_bentopdf_name', { name: 'Garden papers' });
          if (rounds.length === 2)
            return toolCallStream('rotate_bentopdf_document', {
              document: 'sample.pdf',
              degrees: 90,
            });
          return textStream(
            'Named the project Garden papers and rotated sample.pdf by 90 degrees.',
          );
        }
        if (lastUserText(prompt).includes('[wick:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_wick', {});
          if (rounds.length === 1) return toolCallStream('set_wick_name', { name: 'Garden anim' });
          if (rounds.length === 2) return toolCallStream('set_wick_framerate', { framerate: 24 });
          return textStream('Named the project Garden anim and set 24 frames per second.');
        }
        if (lastUserText(prompt).includes('[pptist:depth-create]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_pptist', {});
          if (rounds.length === 1)
            return toolCallStream('set_pptist_title', { title: 'Seed library launch' });
          if (rounds.length === 2)
            return toolCallStream('add_pptist_slide', { text: 'Seed library · Friday' });
          if (rounds.length === 4)
            return toolCallStream('add_pptist_slide', { text: 'How to take part' });
          if (rounds.length === 3 || rounds.length === 5) {
            const deck = JSON.parse(toolResultText(prompt, 'add_pptist_slide') || '{}');
            const slideId = deck.slides.at(-1).id;
            return toolCallStream('add_pptist_text', {
              slideId,
              text:
                rounds.length === 3
                  ? 'Share local seeds. Grow something together.'
                  : 'Bring spare seeds. Label the variety. Take a packet home.',
              left: 100,
              top: 245,
              width: 760,
              height: 140,
              fontSize: 28,
              color: '#28523b',
            });
          }
          const original = JSON.parse(toolResultText(prompt, 'inspect_pptist') || '{}');
          const remove = original.slides[rounds.length - 6];
          if (remove) return toolCallStream('delete_pptist_slide', { slideId: remove.id });
          return textStream('Built an editable two-slide seed library deck.');
        }
        if (lastUserText(prompt).includes('[pptist:depth-revise]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_pptist', {});
          const inspected = JSON.parse(toolResultText(prompt, 'inspect_pptist') || '{}');
          if (rounds.length === 1)
            return toolCallStream('inspect_pptist', { slideId: inspected.slides[0].id });
          if (rounds.length === 2) {
            const element = inspected.elements.find((item: { text?: string }) =>
              item.text?.includes('Friday'),
            );
            return toolCallStream('edit_pptist_element', {
              slideId: inspected.slideId,
              elementId: element.id,
              find: 'Friday',
              replace: 'Saturday',
              top: 80,
            });
          }
          if (rounds.length === 3)
            return toolCallStream('save_pptist_presentation', { name: 'Seed library launch' });
          return textStream('Moved the event to Saturday, preserved your note and exported PPTX.');
        }
        if (lastUserText(prompt).includes('[pptist:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_pptist', {});
          if (rounds.length === 1)
            return toolCallStream('set_pptist_title', { title: 'Garden launch' });
          if (rounds.length === 2)
            return toolCallStream('add_pptist_slide', { text: 'Agent agenda' });
          return textStream('Titled the deck Garden launch and added an agenda slide.');
        }
        if (lastUserText(prompt).includes('[hextris:reset]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_hextris', {});
          if (rounds.length === 1) return toolCallStream('reset_hextris_progress', {});
          return textStream('Cleared the saved game and high scores.');
        }
        if (lastUserText(prompt).includes('[beepbox:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_beepbox', {});
          if (rounds.length === 1) return toolCallStream('set_beepbox_tempo', { tempo: 140 });
          if (rounds.length === 2) return toolCallStream('set_beepbox_key', { key: 'D' });
          return textStream('Set the tempo to 140 and the key to D.');
        }
        if (lastUserText(prompt).includes('[synth:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_web_synth', {});
          if (rounds.length === 1) return toolCallStream('set_web_synth_tempo', { bpm: 128 });
          if (rounds.length === 2)
            return toolCallStream('add_web_synth_module', {
              kind: 'midi_editor',
              title: 'Agent notes',
            });
          if (rounds.length === 3) {
            const data = JSON.parse(toolResultText(prompt, 'add_web_synth_module') || '{}');
            const added = data.viewContexts?.find(
              (vc: { title: string | null }) => vc.title === 'Agent notes',
            );
            return toolCallStream('rename_web_synth_module', {
              id: added?.id,
              title: 'Agent melody',
            });
          }
          return textStream('Set the tempo to 128 and added a MIDI editor named Agent melody.');
        }
        const kanDepth = lastUserText(prompt).match(/\[kan:depth-([a-z-]+)\]/)?.[1];
        if (kanDepth) {
          const rounds = toolResultsThisTurn(prompt);
          const result = (name: string) => JSON.parse(toolResultText(prompt, name) || '{}');
          if (!rounds.length) return toolCallStream('inspect_kan', {});
          const inspected = result('inspect_kan');
          const board = inspected.board;
          const card = board?.lists?.flatMap((list: { cards: unknown[] }) => list.cards)?.[0];
          if (rounds.length === 1) {
            const expectedState = inspected.stateToken;
            if (kanDepth === 'board')
              return toolCallStream('create_kan_board', {
                name: 'Launch',
                lists: ['Ideas', 'Doing', 'Done'],
                expectedState,
              });
            if (kanDepth === 'card')
              return toolCallStream('create_kan_card', {
                listPublicId: board.lists[0].publicId,
                title: 'Ship the home page',
              });
            if (kanDepth === 'label')
              return toolCallStream('create_kan_label', {
                boardPublicId: board.publicId,
                name: 'Launch priority',
                colourCode: '#a855f7',
                expectedState,
              });
            if (kanDepth === 'reorder')
              return toolCallStream('update_kan_list', {
                listPublicId: board.lists.find((list: { name: string }) => list.name === 'Done')
                  .publicId,
                name: 'Shipped',
                index: 1,
                expectedState,
              });
            return toolCallStream('read_kan_card', { cardPublicId: card.publicId });
          }
          if (rounds.length === 2 && !['board', 'card', 'label', 'reorder'].includes(kanDepth)) {
            const detail = result('read_kan_card');
            const expectedState = detail.stateToken;
            const cardPublicId = detail.card.publicId;
            if (kanDepth === 'details')
              return toolCallStream('update_kan_card_details', {
                cardPublicId,
                dueDate: '2026-10-01T12:00:00Z',
                expectedState,
              });
            if (kanDepth === 'assign')
              return toolCallStream('set_kan_card_label', {
                cardPublicId,
                labelPublicId: board.labels[0].publicId,
                assigned: true,
                expectedState,
              });
            if (kanDepth === 'checklist')
              return toolCallStream('create_kan_checklist', {
                cardPublicId,
                name: 'Release checks',
                expectedState,
              });
            if (kanDepth === 'item')
              return toolCallStream('add_kan_checklist_item', {
                checklistPublicId: detail.card.checklists[0].publicId,
                title: 'Check small screens',
                expectedState,
              });
            if (kanDepth === 'complete')
              return toolCallStream('update_kan_checklist_item', {
                checklistItemPublicId: detail.card.checklists[0].items[0].publicId,
                title: 'Small screens verified',
                completed: true,
                expectedState,
              });
            if (kanDepth === 'duplicate')
              return toolCallStream('duplicate_kan_card', {
                cardPublicId,
                listPublicId: board.lists.find((list: { name: string }) => list.name === 'Doing')
                  .publicId,
                title: 'Follow-up',
                expectedState,
              });
            if (kanDepth === 'delete-copy')
              return toolCallStream('delete_kan_card', {
                cardPublicId: board.lists
                  .flatMap((list: { cards: { title: string; publicId: string }[] }) => list.cards)
                  .find((item: { title: string }) => item.title === 'Follow-up').publicId,
                expectedState,
              });
            if (kanDepth === 'rename-checklist')
              return toolCallStream('rename_kan_checklist', {
                checklistPublicId: detail.card.checklists[0].publicId,
                name: 'Ready to ship',
                expectedState,
              });
          }
          return textStream('Kan depth ' + kanDepth + ' complete.');
        }
        if (lastUserText(prompt).includes('[kan:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_kan', {});
          if (rounds.length === 1) {
            const data = JSON.parse(toolResultText(prompt, 'inspect_kan') || '{}');
            return toolCallStream('create_kan_card', {
              listPublicId: data.board?.lists?.[0]?.publicId,
              title: 'Agent card',
              description: 'Added by the scripted agent.',
            });
          }
          if (rounds.length === 2) {
            const created = JSON.parse(toolResultText(prompt, 'create_kan_card') || '{}');
            return toolCallStream('rename_kan_card', {
              cardPublicId: created.publicId,
              title: 'Agent renamed card',
            });
          }
          return textStream('Added a card to the first list and renamed it.');
        }
        if (lastUserText(prompt).includes('[opencut:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_opencut', {});
          if (rounds.length === 1) {
            const data = JSON.parse(toolResultText(prompt, 'inspect_opencut') || '{}');
            return toolCallStream('set_opencut_text', {
              elementId: data.elements?.find((element: { type: string }) => element.type === 'text')
                ?.id,
              content: 'Garden film',
            });
          }
          if (rounds.length === 2)
            return toolCallStream('set_opencut_name', { name: 'Garden film' });
          return textStream('Named the native video project and changed its title text.');
        }
        if (lastUserText(prompt).includes('[playcanvas:rename]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_playcanvas_editor', {});
          if (rounds.length === 1) {
            const data = JSON.parse(toolResultText(prompt, 'inspect_playcanvas_editor') || '{}');
            return toolCallStream('rename_playcanvas_editor_entity', {
              entityId: data.entities?.find(
                (entity: { name: string }) => entity.name === 'Garden Cube',
              )?.id,
              name: 'Agent cube',
            });
          }
          if (rounds.length === 2)
            return toolCallStream('set_playcanvas_editor_name', { name: 'Garden scene' });
          return textStream('Named the scene and renamed its native cube.');
        }
        if (lastUserText(prompt).includes('[blockbench:depth-create]')) {
          const rounds = toolResultsThisTurn(prompt);
          const result = (name: string) => JSON.parse(toolResultText(prompt, name) || '{}');
          const parentId = result('add_blockbench_group').createdId;
          if (!rounds.length)
            return toolCallStream('create_blockbench_model', { name: 'Seedling stand' });
          if (rounds.length === 1) return toolCallStream('add_blockbench_group', { name: 'Stand' });
          if (rounds.length === 2)
            return toolCallStream('add_blockbench_cube', {
              name: 'Shelf',
              from: [-8, 12, -5],
              to: [8, 14, 5],
              parentId,
            });
          if (rounds.length === 3)
            return toolCallStream('add_blockbench_cube', {
              name: 'Left support',
              from: [-7, 0, -4],
              to: [-5, 12, 4],
              parentId,
            });
          if (rounds.length === 4)
            return toolCallStream('add_blockbench_cube', {
              name: 'Right support',
              from: [5, 0, -4],
              to: [7, 12, 4],
              parentId,
            });
          if (rounds.length === 5)
            return toolCallStream('add_blockbench_cube', {
              name: 'Temporary brace',
              from: [-4, 5, -1],
              to: [4, 6, 1],
              parentId,
            });
          if (rounds.length === 6)
            return toolCallStream('move_blockbench_element', {
              elementId: result('add_blockbench_cube').createdId,
              parentId: 'root',
            });
          if (rounds.length === 7)
            return toolCallStream('delete_blockbench_element', {
              elementId: result('add_blockbench_cube').createdId,
            });
          return textStream('Built an editable three-part stand.');
        }
        if (lastUserText(prompt).includes('[blockbench:depth-revise]')) {
          const rounds = toolResultsThisTurn(prompt);
          const result = JSON.parse(toolResultText(prompt, 'inspect_blockbench') || '{}');
          const shelf = result.elements?.find((e: { name: string }) => e.name.startsWith('Shelf'));
          if (!rounds.length) return toolCallStream('inspect_blockbench', {});
          if (rounds.length === 1)
            return toolCallStream('update_blockbench_cube', {
              elementId: shelf.id,
              to: [10, 14, 5],
            });
          if (rounds.length === 2)
            return toolCallStream('save_blockbench_model', { name: 'Revised editable stand' });
          if (rounds.length === 3)
            return toolCallStream('save_blockbench_gltf', { name: 'Revised stand scene' });
          return textStream('Widened the shelf while preserving your name and painted texture.');
        }
        if (lastUserText(prompt).includes('[blockbench:rename]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_blockbench', {});
          if (rounds.length === 1) {
            const data = JSON.parse(toolResultText(prompt, 'inspect_blockbench') || '{}');
            return toolCallStream('rename_blockbench_element', {
              elementId: data.elements?.[0]?.id,
              name: 'Lantern body',
            });
          }
          if (rounds.length === 2)
            return toolCallStream('set_blockbench_name', { name: 'Garden lantern' });
          return textStream('Renamed the native model and lantern body.');
        }
        if (lastUserText(prompt).includes('[webprint:svg]')) {
          const rounds = toolResultsThisTurn(prompt);
          const steps: [string, Record<string, unknown>][] = [
            ['inspect_svgedit', {}],
            [
              'add_svgedit_shape',
              {
                type: 'rect',
                attributes: { x: 30, y: 220, width: 340, height: 95, fill: '#d8ead5' },
              },
            ],
            [
              'add_svgedit_shape',
              {
                type: 'text',
                attributes: { x: 50, y: 275, 'font-size': 28, fill: '#24583e' },
                text: 'Seed library',
              },
            ],
          ];
          if (rounds.length < steps.length) return toolCallStream(...steps[rounds.length]!);
          return textStream('Added the site badge with editable shapes and text.');
        }
        if (lastUserText(prompt).includes('[webprint:svg-revise]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_svgedit', {});
          const data = JSON.parse(toolResultText(prompt, 'inspect_svgedit') || '{}');
          if (rounds.length === 1)
            return toolCallStream('set_svgedit_object', {
              elementId: data.objects.find((o: { type: string }) => o.type === 'text').id,
              text: 'Seed swap Saturday',
            });
          if (rounds.length === 2)
            return toolCallStream('save_svgedit_svg', { name: 'Site badge' });
          return textStream('Revised the badge and saved reusable SVG.');
        }
        if (lastUserText(prompt).includes('[webprint:layout]')) {
          const rounds = toolResultsThisTurn(prompt);
          const steps: [string, Record<string, unknown>][] = [
            [
              'add_layout_text',
              {
                name: 'headline',
                text: 'Seed library',
                x: 20,
                y: 25,
                width: 160,
                height: 20,
                fontSize: 28,
              },
            ],
            ['add_layout_page', {}],
            [
              'add_layout_text',
              {
                pageIndex: 1,
                name: 'details',
                text: 'Bring seeds to share.',
                x: 20,
                y: 25,
                width: 160,
                height: 30,
                fontSize: 18,
              },
            ],
          ];
          if (rounds.length < steps.length) return toolCallStream(...steps[rounds.length]!);
          return textStream('Prepared the two-page handout.');
        }
        if (lastUserText(prompt).includes('[webprint:layout-revise]')) {
          const rounds = toolResultsThisTurn(prompt);
          const steps: [string, Record<string, unknown>][] = [
            ['inspect_layout', { pageIndex: 1 }],
            [
              'update_layout_block',
              {
                pageIndex: 1,
                name: 'details',
                text: 'Bring seeds to share on Saturday.',
                fontSize: 20,
              },
            ],
            ['save_layout_pdf', { name: 'Seed swap handout' }],
            ['save_layout_image', { name: 'Handout details', pageIndex: 1 }],
          ];
          if (rounds.length < steps.length) return toolCallStream(...steps[rounds.length]!);
          return textStream('Revised page two and exported the handout.');
        }
        if (lastUserText(prompt).includes('[svgedit:fill]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_svgedit', {});
          if (rounds.length === 1) {
            const data = JSON.parse(toolResultText(prompt, 'inspect_svgedit') || '{}');
            const elementId = data.objects?.find((o: { type: string }) => o.type === 'rect')?.id;
            if (!elementId) return textStream('Draw a rectangle first.');
            return toolCallStream('set_svgedit_fill', { elementId, color: '#3b82f6' });
          }
          if (rounds.length === 2)
            return toolCallStream('set_svgedit_title', { title: 'Lantern badge' });
          return textStream('Colored the shape and saved the drawing in Garden.');
        }
        if (lastUserText(prompt).includes('[twine:passage]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_twine', {});
          if (rounds.length === 1) {
            const data = JSON.parse(toolResultText(prompt, 'inspect_twine') || '{}');
            const story = data.stories?.[0];
            const passage = story?.passageDetails?.find(
              (p: { name: string }) => p.name === 'Follow',
            );
            if (!passage) return textStream('Create the Follow passage first.');
            return toolCallStream('set_twine_passage', {
              storyId: story.id,
              passageId: passage.id,
              text: 'The garden wakes. [[Epilogue]]',
            });
          }
          return textStream('Updated the passage and created its linked destination in Garden.');
        }
        if (lastUserText(prompt).includes('[twine:title]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_twine', {});
          if (rounds.length === 1) {
            const data = JSON.parse(toolResultText(prompt, 'inspect_twine') || '{}');
            const storyId = data.stories?.[0]?.id;
            if (!storyId) return textStream('Create a story first.');
            return toolCallStream('set_twine_title', { storyId, title: 'The Lantern Garden' });
          }
          return textStream('Renamed the story and saved it in Garden.');
        }
        if (lastUserText(prompt).includes('[ketcher:structure]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_ketcher', {});
          if (rounds.length === 1)
            return toolCallStream('set_ketcher_structure', { structure: 'CCO' });
          return textStream('Drew ethanol and saved it in Garden.');
        }
        if (lastUserText(prompt).includes('[gephi:title]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_gephi', {});
          if (rounds.length === 1)
            return toolCallStream('set_gephi_title', { title: 'Research connections' });
          return textStream('Updated the network title and saved it in Garden.');
        }
        if (lastUserText(prompt).includes('[jupyterlite:depth-create]')) {
          const rounds = toolResultsThisTurn(prompt);
          const cellId = JSON.parse(
            toolResultText(prompt, 'append_jupyterlite_cell') || '{}',
          ).cellId;
          const source =
            'import csv\nimport numpy as np\nimport matplotlib.pyplot as plt\nwith open("observations.csv") as f:\n    values = [float(row["Height"]) for row in csv.DictReader(f)]\nprint("Mean height:", float(np.mean(values)))\nplt.figure(figsize=(5, 3))\nplt.bar(["A", "B", "C"], values, color="#42866b")\nplt.ylabel("Height (cm)")\nplt.title("Seedling trial")\nplt.tight_layout()\nplt.show()';
          if (!rounds.length)
            return toolCallStream('create_jupyterlite_notebook', { name: 'seed-trial.ipynb' });
          if (rounds.length === 1)
            return toolCallStream('append_jupyterlite_cell', {
              cellType: 'markdown',
              source: '## Seedling trial\nThree measurements from the shared garden.',
            });
          if (rounds.length === 2)
            return toolCallStream('append_jupyterlite_cell', { cellType: 'code', source });
          if (rounds.length === 3) return toolCallStream('run_jupyterlite_cell', { cellId });
          if (rounds.length === 4)
            return toolCallStream('replace_jupyterlite_cell_text', {
              cellId,
              find: 'row["Height"]',
              replace: 'row["Height_cm"]',
            });
          if (rounds.length === 5) return toolCallStream('run_jupyterlite_cell', { cellId });
          if (rounds.length === 6) {
            const result = JSON.parse(toolResultText(prompt, 'run_jupyterlite_cell') || '{}');
            const outputIndex = result.cells?.[0]?.outputs?.find(
              (o: { exportablePng?: boolean }) => o.exportablePng,
            )?.outputIndex;
            return toolCallStream('save_jupyterlite_plot', {
              cellId,
              outputIndex,
              name: 'Seedling heights',
            });
          }
          if (rounds.length === 7)
            return toolCallStream('save_jupyterlite_notebook', { name: 'Seed trial analysis' });
          return textStream(
            'Analyzed the seed trial, corrected the column error and saved the notebook and plot.',
          );
        }
        if (lastUserText(prompt).includes('[jupyterlite:depth-note]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_jupyterlite', {});
          if (rounds.length === 1) {
            const result = JSON.parse(toolResultText(prompt, 'inspect_jupyterlite') || '{}');
            return toolCallStream('replace_jupyterlite_cell_text', {
              cellId: result.cells?.find((c: { type: string }) => c.type === 'markdown')?.id,
              find: 'Three measurements',
              replace: 'Three measured seedlings',
            });
          }
          return textStream('Clarified the introduction while retaining your note.');
        }
        if (lastUserText(prompt).includes('[jupyterlite:depth-revise]')) {
          const rounds = toolResultsThisTurn(prompt);
          const result = JSON.parse(toolResultText(prompt, 'inspect_jupyterlite') || '{}');
          const note = result.cells?.find((c: { type: string }) => c.type === 'markdown');
          const empty = result.cells?.find((c: { source: string }) => c.source === '');
          const steps: [string, Record<string, unknown>][] = [
            ['inspect_jupyterlite', {}],
            [
              'replace_jupyterlite_cell_text',
              { cellId: note?.id, find: 'shared garden', replace: 'community garden' },
            ],
            ['move_jupyterlite_cell', { cellId: note?.id, direction: 'up' }],
            ['delete_jupyterlite_cell', { cellId: empty?.id }],
            [
              'insert_jupyterlite_cell',
              {
                index: 2,
                cellType: 'markdown',
                source: '## Findings\nMean height is 4 cm. This small sample is descriptive.',
              },
            ],
            ['save_jupyterlite_notebook', { name: 'Revised seed trial' }],
          ];
          if (rounds.length < steps.length) return toolCallStream(...steps[rounds.length]!);
          return textStream('Revised the analysis and preserved your lab note.');
        }
        if (lastUserText(prompt).includes('[jupyterlite:depth-rerun]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_jupyterlite', {});
          if (rounds.length === 1) {
            const result = JSON.parse(toolResultText(prompt, 'inspect_jupyterlite') || '{}');
            return toolCallStream('run_jupyterlite_cell', {
              cellId: result.cells?.find((c: { type: string }) => c.type === 'code')?.id,
            });
          }
          return textStream('Re-executed the saved analysis in a fresh kernel.');
        }
        if (lastUserText(prompt).includes('[jupyterlite:cell]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_jupyterlite', {});
          if (rounds.length === 1)
            return toolCallStream('append_jupyterlite_cell', {
              cellType: 'markdown',
              source: '## Findings\nThe measured mean is 4.0.',
            });
          return textStream('Added the findings cell and saved the notebook.');
        }
        if (lastUserText(prompt).includes('[site:guestbook]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('add_guestbook', {});
          return textStream(
            'Added a guestbook at the end of the home page; entries will show in the Store pane.',
          );
        }
        if (lastUserText(prompt).includes('[recorder:name]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_recordings', {});
          if (rounds.length === 1)
            return toolCallStream('set_recorder_name', { name: 'Walkthrough takes' });
          return textStream('Listed the recordings and named the Crux Walkthrough takes.');
        }
        if (lastUserText(prompt).includes('[whiteboard:image]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_whiteboard', {});
          if (rounds.length === 1)
            return toolCallStream('save_whiteboard_image', {
              format: 'svg',
              name: 'Idea map, vector',
            });
          return textStream('Saved the whiteboard as an SVG output.');
        }
        if (lastUserText(prompt).includes('[timeline:story]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_timeline', {});
          if (rounds.length === 1)
            return toolCallStream('set_timeline_name', { name: 'A Garden Year, Told' });
          if (rounds.length === 2)
            return toolCallStream('upsert_events', {
              events: [
                {
                  unique_id: 'midsummer',
                  start_date: { year: 2026, month: 6, day: 21 },
                  text: {
                    headline: 'Midsummer evening',
                    text: 'The longest day, spent entirely outside.',
                  },
                  media: {
                    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Sunset_2007-1.jpg/640px-Sunset_2007-1.jpg',
                    caption: 'The light at nine in the evening.',
                    credit: 'Wikimedia Commons',
                  },
                  group: 'Weather',
                },
                {
                  unique_id: 'heatwave',
                  start_date: { year: 2026, month: 7, day: 12 },
                  end_date: { year: 2026, month: 7, day: 19 },
                  text: {
                    headline: 'A week of heat',
                    text: 'Watering at dawn and dusk; the lettuces bolted.',
                  },
                  group: 'Weather',
                },
              ],
            });
          return textStream(
            'Named the timeline A Garden Year, Told and added two summer events with a picture.',
          );
        }
        if (lastUserText(prompt).includes('[model:coaster]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_model', {});
          if (rounds.length === 1)
            return toolCallStream('set_model_name', { name: 'Moss Coaster' });
          if (rounds.length === 2)
            return toolCallStream('set_model_source', {
              source: [
                '// Moss Coaster: a hexagon with a leaf groove for a cup',
                "const jscad = require('@jscad/modeling')",
                'const { cylinder, ellipse } = jscad.primitives',
                'const { subtract, union } = jscad.booleans',
                'const { translate, rotateZ } = jscad.transforms',
                'const { extrudeLinear } = jscad.extrusions',
                'const { colorize } = jscad.colors',
                '',
                'const main = () => {',
                '  const hexagon = cylinder({ radius: 45, height: 6, segments: 6 })',
                '  const leaf = extrudeLinear({ height: 2 }, ellipse({ radius: [22, 9], segments: 48 }))',
                '  const groove = translate([0, 0, 5], union(leaf, rotateZ(Math.PI / 2, leaf)))',
                '  return colorize([0.42, 0.62, 0.45], subtract(hexagon, groove))',
                '}',
                '',
                'module.exports = { main }',
                '',
              ].join('\n'),
            });
          if (rounds.length === 3)
            return toolCallStream('save_model', { format: '3mf', name: 'Moss Coaster' });
          return textStream(
            'Named the model Moss Coaster, wrote a hexagonal coaster with a leaf groove and saved a 3MF of it.',
          );
        }
        if (lastUserText(prompt).includes('[song:tune]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_song', {});
          if (rounds.length === 1) return toolCallStream('set_song_name', { name: 'Moss Waltz' });
          if (rounds.length === 2) {
            // A waltz in G: three beats a bar, 480 ticks a beat
            const bars = [
              [67, 71, 74],
              [79, 79, 77],
              [76, 74, 71],
              [69, 69, 69],
              [67, 71, 74],
              [79, 79, 81],
              [83, 81, 77],
              [79, 79, 79],
            ];
            const notes = bars.flatMap((bar, b) =>
              bar.map((noteNumber, i) => ({
                tick: (b * 3 + i) * 480,
                duration: 440,
                noteNumber,
                velocity: i === 0 ? 110 : 90,
              })),
            );
            return toolCallStream('set_track_notes', {
              track: 1,
              name: 'Melody',
              program: 0,
              tempo: 132,
              notes,
            });
          }
          if (rounds.length === 3) return toolCallStream('save_song_audio', { name: 'Moss Waltz' });
          return textStream(
            'Named the song Moss Waltz, wrote a waltz melody in G on track 1 and saved a WAV of it.',
          );
        }
        if (lastUserText(prompt).includes('[score:tune]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_score', {});
          if (rounds.length === 1) return toolCallStream('set_score_name', { name: 'Moss Waltz' });
          if (rounds.length === 2)
            return toolCallStream('set_score_abc', {
              abc: 'X:1\nT:Moss Waltz\nC:The collaborator\nM:3/4\nL:1/4\nQ:1/4=120\nK:G\n|: G B d | g2 f | e d B | A3 | G B d | g2 a | b a f | g3 :|\n',
            });
          if (rounds.length === 3)
            return toolCallStream('save_score_image', { format: 'png', name: 'Moss Waltz' });
          return textStream(
            'Named the score Moss Waltz, wrote a waltz in G and saved a PNG of it.',
          );
        }
        if (lastUserText(prompt).includes('[map:world]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_map', {});
          if (rounds.length === 1) return toolCallStream('set_map_name', { name: 'Moss Isles' });
          if (rounds.length === 2)
            return toolCallStream('save_map_image', { format: 'png', name: 'Moss Isles' });
          return textStream('Named the world Moss Isles and saved a PNG of it.');
        }
        if (lastUserText(prompt).includes('[font:letter]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_font', {});
          if (rounds.length === 1) return toolCallStream('set_font_name', { name: 'Moss Sans' });
          if (rounds.length === 2)
            return toolCallStream('set_glyph_svg', {
              char: 'A',
              svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 700"><path d="M60 700 L300 0 L400 0 L640 700 L520 700 L460 520 L240 520 L180 700 Z M280 400 L420 400 L350 190 Z" fill="black"/></svg>',
            });
          if (rounds.length === 3)
            return toolCallStream('save_font', { format: 'otf', name: 'Moss Sans' });
          return textStream('Named the font Moss Sans, drew an A from SVG and saved the OTF.');
        }
        if (lastUserText(prompt).includes('[crux:operate]')) {
          // The crux collaborator shows its work and tests a function (collaborator-operates.spec).
          const rounds = toolResultsThisTurn(prompt);
          const steps: [string, Record<string, unknown>][] = [
            ['show', { what: 'pane', pane: 'history' }],
            ['show', { what: 'file', path: 'index.html' }],
            ['test_function', { name: 'hello', body: { n: 7 } }],
          ];
          const step = steps[rounds.length];
          if (step) return toolCallStream(step[0], step[1]);
          return textStream('Opened History, showed the page, and hello answered with the echo.');
        }
        if (lastUserText(prompt).includes('[garden:operate]')) {
          // The Keeper reads the screen and the garden, chooses a collaborator, exports (keeper-operates.spec).
          const rounds = toolResultsThisTurn(prompt);
          const steps: [string, Record<string, unknown>][] = [
            ['look', {}],
            ['list_templates', {}],
            ['search_garden', { query: 'Tour stop' }],
            ['read_garden_file', { title: 'Tour stop', path: 'index.html' }],
            ['choose_collaborator', { title: 'Tour stop', model: 'claude-sonnet-5' }],
            ['export_crux', { title: 'Tour stop' }],
          ];
          const step = steps[rounds.length];
          if (step) return toolCallStream(step[0], step[1]);
          return textStream(
            'I looked, searched the garden, read the page, chose Claude Sonnet 5 for Tour stop and exported it with its history.',
          );
        }
        if (lastUserText(prompt).includes('[garden:tour')) {
          // The Keeper gives the tour by operating the workspace (keeper-tour.spec).
          // "slowly": hold each step back so a test can stop the Keeper mid-tour.
          if (/\bslowly\b/i.test(lastUserText(prompt)))
            await new Promise((r) => setTimeout(r, 1500));
          const rounds = toolResultsThisTurn(prompt);
          const steps: [string, Record<string, unknown>][] = lastUserText(prompt).includes(
            '[garden:tour:pane-first]',
          )
            ? [
                ['show', { what: 'crux', title: 'Tour stop' }],
                ['show', { what: 'pane', pane: 'artifacts' }],
                ['show', { what: 'pane', pane: 'history' }],
                ['show', { what: 'file', title: 'Tour stop', path: 'index.html' }],
                ['snapshot_crux', { title: 'Tour stop', label: "The tour's first moment" }],
                ['set_names', { title: 'The Tour Garden', panes: { collaboration: 'The porch' } }],
              ]
            : lastUserText(prompt).includes('[garden:tour:pane-only]')
              ? [['show', { what: 'pane', pane: 'history' }]]
              : [
                  ['show', { what: 'crux', title: 'Tour stop' }],
                  ['show', { what: 'pane', pane: 'artifacts' }],
                  ['show', { what: 'file', title: 'Tour stop', path: 'index.html' }],
                  ['snapshot_crux', { title: 'Tour stop', label: "The tour's first moment" }],
                  ['show', { what: 'pane', pane: 'history' }],
                  [
                    'set_names',
                    { title: 'The Tour Garden', panes: { collaboration: 'The porch' } },
                  ],
                ];
          const step = steps[rounds.length];
          if (step) return toolCallStream(step[0], step[1]);
          return textStream(
            'That was the tour: the crux, its files, a moment kept in Growth, and the garden named. Tell the collaborator what to make next.',
          );
        }
        if (lastUserText(prompt).includes('[garden:plant]')) {
          // The Keeper plants a crux with a brief (garden-tools, step 6).
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length)
            return toolCallStream('plant_crux', {
              title: 'Field notes',
              template: 'blank',
              brief: 'Notes from the field study, one page per day.',
            });
          return textStream('Planted Field notes with its brief. Open it from your garden.');
        }
        if (lastUserText(prompt).includes('[shader:tweak]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_shader', {});
          if (rounds.length === 1) return toolCallStream('set_shader_name', { name: 'Warm rings' });
          if (rounds.length === 2)
            return toolCallStream('set_shader_source', {
              source:
                '#ifdef GL_ES\nprecision mediump float;\n#endif\nuniform vec2 u_resolution;\nuniform float u_time;\nvoid main() {\n  vec2 st = gl_FragCoord.xy / u_resolution.xy;\n  float d = length(st - 0.5);\n  float ring = smoothstep(0.02, 0.0, abs(sin(d * 24.0 - u_time)) - 0.4);\n  gl_FragColor = vec4(mix(vec3(0.1, 0.05, 0.02), vec3(1.0, 0.6, 0.2), ring), 1.0);\n}\n',
            });
          if (rounds.length === 3)
            return toolCallStream('save_shader_frame', { name: 'Warm rings' });
          return textStream(
            'Named the shader Warm rings, replaced its source with warmer rings and saved a frame.',
          );
        }
        if (lastUserText(prompt).includes('[sketch:frame]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_sketch', {});
          if (rounds.length === 1)
            return toolCallStream('set_sketch_name', { name: 'Seven winds' });
          if (rounds.length === 2) return toolCallStream('set_sketch_seed', { seed: 7 });
          if (rounds.length === 3)
            return toolCallStream('save_sketch_frame', { name: 'Seven winds' });
          return textStream('Named the sketch Seven winds, set the seed to 7 and saved a frame.');
        }
        if (lastUserText(prompt).includes('[map:places]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_map', {});
          if (rounds.length === 1)
            return toolCallStream('set_map_name', { name: 'Seed swap walk' });
          if (rounds.length === 2)
            return toolCallStream('add_map_place', {
              title: 'Seed library',
              lng: -0.1195,
              lat: 51.5033,
              notes: 'Start here at 10',
              color: '#c0392b',
            });
          if (rounds.length === 3)
            return toolCallStream('add_map_place', {
              title: 'Community garden',
              lng: -0.0865,
              lat: 51.5045,
              notes: 'Bring pots',
            });
          if (rounds.length === 4) return toolCallStream('fit_map', {});
          if (rounds.length === 5)
            return toolCallStream('save_map_image', { name: 'Seed swap walk' });
          return textStream(
            'Named the map, added the seed library and the community garden, fitted the view and saved the picture.',
          );
        }
        if (lastUserText(prompt).includes('[layout:poster]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_layout', {});
          if (rounds.length === 1)
            return toolCallStream('set_layout_name', { name: 'Open day poster' });
          if (rounds.length === 2)
            return toolCallStream('add_layout_text', {
              name: 'headline',
              text: 'Open day at the seed library',
              x: 15,
              y: 30,
              width: 180,
              height: 30,
              fontSize: 32,
              align: 'center',
            });
          if (rounds.length === 3)
            return toolCallStream('add_layout_text', {
              name: 'when',
              text: 'Saturday 3 October, 10 to 4',
              x: 15,
              y: 70,
              width: 180,
              height: 14,
              fontSize: 16,
              align: 'center',
            });
          if (rounds.length === 4)
            return toolCallStream('save_layout_pdf', { name: 'Open day poster' });
          if (rounds.length === 5)
            return toolCallStream('save_layout_image', { name: 'Open day poster' });
          return textStream(
            'Named the poster, set the headline and the date, and saved the PDF and the image to the Cruxspace.',
          );
        }
        if (lastUserText(prompt).includes('[form:build]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_form', {});
          if (rounds.length === 1)
            return toolCallStream('set_form_name', { name: 'Open day RSVP' });
          if (rounds.length === 2)
            return toolCallStream('add_form_field', {
              type: 'radio',
              label: 'Will you come?',
              key: 'coming',
              options: ['Yes', 'No'],
              required: true,
            });
          if (rounds.length === 3)
            return toolCallStream('add_form_field', {
              type: 'textarea',
              label: 'Anything we should know?',
              key: 'notes',
            });
          return textStream('Named the form Open day RSVP and added the coming and notes fields.');
        }
        if (lastUserText(prompt).includes('[productivity:note')) {
          const rounds = toolResultsThisTurn(prompt);
          const failure = rounds
            .map((name) => toolResultText(prompt, name))
            .find((value) => value?.startsWith('Error'));
          if (failure) return textStream(failure);
          if (!rounds.length) return toolCallStream('inspect_notebook', {});
          const inspected = JSON.parse(toolResultText(prompt, 'inspect_notebook') || '{}');
          const note = inspected.activeNote;
          if (rounds.length === 1) return toolCallStream('read_open_note', { note });
          const followup = lastUserText(prompt).includes('[productivity:note-followup]');
          if (rounds.length === 2)
            return followup
              ? toolCallStream('replace_note_text', {
                  note,
                  search: 'Friday',
                  replacement: 'Saturday',
                })
              : toolCallStream('replace_note_text', {
                  note,
                  search: 'Budget is 120.',
                  replacement: 'Budget is 180.',
                });
          if (rounds.length === 3)
            return followup
              ? toolCallStream('export_note_docx', { note })
              : toolCallStream('append_note_text', {
                  note,
                  text: 'Next steps: confirm the venue.',
                });
          return textStream(
            followup
              ? 'Updated the revised brief and exported Word.'
              : 'Revised the brief and added next steps.',
          );
        }
        if (lastUserText(prompt).includes('[productivity:budget')) {
          const rounds = toolResultsThisTurn(prompt);
          const failure = rounds
            .map((name) => toolResultText(prompt, name))
            .find((value) => value?.startsWith('Error'));
          if (failure) return textStream(failure);
          if (!rounds.length) return toolCallStream('inspect_workbook', {});
          const followup = lastUserText(prompt).includes('[productivity:budget-followup]');
          if (followup) {
            if (rounds.length === 1)
              return toolCallStream('read_workbook_range', {
                sheetId: 'budget-sheet',
                range: 'A1:D6',
              });
            if (rounds.length === 2)
              return toolCallStream('set_workbook_cells', {
                sheetId: 'budget-sheet',
                cells: [{ address: 'C3', value: 40 }],
              });
            if (rounds.length === 3)
              return toolCallStream('save_workbook_csv', {
                sheetId: 'budget-sheet',
                name: 'Revised budget',
              });
            return textStream('Updated the revised budget and saved CSV.');
          }
          if (rounds.length === 1)
            return toolCallStream('add_workbook_sheet', {
              name: 'Assumptions',
              rows: 100,
              columns: 20,
            });
          const added = JSON.parse(toolResultText(prompt, 'add_workbook_sheet') || '{}');
          const sheetId = added.project?.sheets?.find(
            (sheet: { name: string }) => sheet.name === 'Assumptions',
          )?.id;
          if (rounds.length === 2)
            return toolCallStream('rename_workbook_sheet', {
              sheetId,
              name: 'Planning assumptions',
            });
          if (rounds.length === 3)
            return toolCallStream('set_workbook_cells', {
              sheetId,
              cells: [
                { address: 'A1', value: 'Reserve' },
                { address: 'B1', value: 20 },
                { address: 'A2', value: 'Budget total' },
                { address: 'B2', value: '=Budget!D5' },
              ],
            });
          if (rounds.length === 4)
            return toolCallStream('set_workbook_cells', {
              sheetId: 'budget-sheet',
              cells: [
                { address: 'B2', value: 8 },
                { address: 'D6', value: '=SUM(D2:D3)' },
              ],
            });
          if (rounds.length === 5)
            return toolCallStream('format_workbook_range', {
              sheetId: 'budget-sheet',
              range: 'A1:D1',
              bold: true,
              background: '#d8ead5',
            });
          if (rounds.length === 6)
            return toolCallStream('format_workbook_range', {
              sheetId: 'budget-sheet',
              range: 'C2:D6',
              numberFormat: 'usd',
            });
          if (rounds.length === 7)
            return toolCallStream('read_workbook_range', {
              sheetId: 'budget-sheet',
              range: 'A1:D6',
            });
          if (rounds.length === 8)
            return toolCallStream('save_workbook_csv', {
              sheetId: 'budget-sheet',
              name: 'Workshop budget',
            });
          return textStream('Organized the budget, formatted costs and saved CSV.');
        }
        if (lastUserText(prompt).includes('[notes:document]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_notebook', {});
          if (rounds.length === 1) return toolCallStream('export_note_docx', {});
          return textStream('Exported the open note as a Word document in exports.');
        }
        if (lastUserText(prompt).includes('[shop:product]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length)
            return toolCallStream('write_file', {
              path: 'src/content/products/moss-jar.md',
              content:
                "---\nname: 'Moss jar'\ndescription: 'A closed jar of living moss for a desk.'\nprice: 18\ncurrency: USD\ncategories:\n  - Living\npublishDate: 2026-09-14T12:00:00Z\n---\n\nSealed glass, a pinch of soil, moss from the north side of the garden. Mist it once a month.\n",
            });
          return textStream('Added the moss jar to the shop at 18 dollars.');
        }
        if (lastUserText(prompt).includes('[recipes:recipe]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length)
            return toolCallStream('write_file', {
              path: 'src/content/recipes/moss-tea.md',
              content:
                "---\ntitle: 'Moss tea'\ndescription: 'A green infusion for a slow afternoon.'\npublishDate: 2026-09-14T12:00:00Z\nprepTime: 5\ncookTime: 10\nservings: 2\ncategory: 'Drinks'\ntags:\n  - garden\n---\n\n## Ingredients\n\n- 2 tsp green tea\n- 1 sprig mint\n- 500 ml water\n\n## Method\n\n1. Bring the water to just under the boil.\n2. Pour over the tea and mint; steep for four minutes.\n3. Strain and drink slowly.\n",
            });
          return textStream('Wrote the moss tea recipe with its ingredients and method.');
        }
        const homeHandoff = lastUserText(prompt).match(
          /\[home:collaborate-(revise|changed|repair|continue)\]/,
        )?.[1];
        if (homeHandoff) {
          const n = toolResultsThisTurn(prompt).length;
          const path = 'src/content/blog/compost.md';
          if (homeHandoff === 'repair') {
            if (n === 0 || n === 3) return toolCallStream('check_site', {});
            if (n === 1) return toolCallStream('read_file', { path });
            if (n === 2)
              return toolCallStream('edit_file', {
                path,
                old_string: 'publishDate: not-a-date',
                new_string: 'publishDate: 2026-09-14T12:00:00Z',
              });
          } else {
            if (n === 0 || (homeHandoff === 'changed' && n === 2))
              return toolCallStream('read_file', { path });
            if (n === 1) {
              if (homeHandoff !== 'continue') await waitForMockHandoff(abortSignal);
              return toolCallStream('edit_file', {
                path,
                old_string:
                  homeHandoff === 'revise'
                    ? 'Our first draft.'
                    : homeHandoff === 'changed'
                      ? 'We meet on Saturday.'
                      : 'Bring your own gloves.',
                new_string:
                  homeHandoff === 'revise'
                    ? 'We meet on Saturday.'
                    : homeHandoff === 'changed'
                      ? 'We meet at noon on Saturday.'
                      : 'Bring your own gloves and a reusable cup.',
              });
            }
            if (homeHandoff === 'changed' && n === 3)
              return toolCallStream('edit_file', {
                path,
                old_string: 'We meet on Sunday.',
                new_string: 'We meet at noon on Sunday.',
              });
          }
          return textStream('Home collaboration ' + homeHandoff + ' complete.');
        }
        if (lastUserText(prompt).includes('[home:post]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length)
            return toolCallStream('write_file', {
              path: 'src/content/blog/moss.md',
              content:
                "---\ntitle: 'Moss'\ndescription: 'The quiet ground cover of a garden.'\npublishDate: 2026-09-14T12:00:00Z\ntags:\n  - garden\n---\n\nMoss grows where nothing else bothers to. It is the first thing to arrive and the last to leave.\n",
            });
          return textStream('Drafted a post about moss and tagged it garden.');
        }
        if (lastUserText(prompt).includes('[blog:post]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length)
            return toolCallStream('write_file', {
              path: 'content/posts/moss.md',
              content:
                '---\ntitle: "Moss"\ndescription: "The quiet ground cover of a garden."\npublishDate: "2026-09-14"\ntags: ["garden"]\n---\n\nMoss grows where nothing else bothers to. It is the first thing to arrive and the last to leave.\n',
            });
          return textStream('Drafted a post about moss and tagged it garden.');
        }
        if (lastUserText(prompt).includes('[garden:note]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length)
            return toolCallStream('write_file', {
              path: 'src/content/wiki/notes/moss.md',
              content:
                '---\ntitle: "Moss"\ndescription: "The quiet ground cover of a garden."\ncreatedAt: 2026-09-14\nupdatedAt: 2026-09-14\ntags: ["gardening"]\ngrowthStage: "seedling"\n---\n\nMoss grows where nothing else bothers to. It is the first thing to arrive and the last to leave; see [[Tending notes]] for why that matters and [[growth-stages|the stages]] it never seems to pass.\n',
            });
          return textStream(
            'Planted a seedling about moss, linked to Tending notes and Growth stages.',
          );
        }
        if (lastUserText(prompt).includes('[notes:book]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_notebook', {});
          if (rounds.length === 1) return toolCallStream('save_notebook_book', {});
          return textStream('Built the book from the public notes and saved it in exports.');
        }
        if (lastUserText(prompt).includes('[notes:import]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length)
            return toolCallStream('import_document', { path: 'inbox/Letter.docx' });
          return textStream('Imported the letter into the notebook.');
        }
        if (lastUserText(prompt).includes('[rawgraphs:depth-create]')) {
          const n = toolResultsThisTurn(prompt).length;
          if (!n) return toolCallStream('list_rawgraphs_charts', { limit: 50 });
          if (n === 1)
            return toolCallStream('set_rawgraphs_data', {
              text: 'Channel,Sales,Visits\nShop,24,120\nMarket,42,210\nOnline,35,170',
            });
          if (n === 2)
            return toolCallStream('select_rawgraphs_chart', { chartId: 'rawgraphs.barchart' });
          if (n === 3)
            return toolCallStream('map_rawgraphs_columns', {
              dimensions: { bars: ['Channel'], size: ['Sales'] },
            });
          if (n === 4)
            return toolCallStream('set_rawgraphs_options', {
              values: {
                width: 900,
                height: 550,
                background: '#faf4e8',
                barsOrientation: 'horizontal',
              },
            });
          if (n === 5)
            return toolCallStream('save_rawgraphs_figure', {
              name: 'Sales overview',
              format: 'svg',
            });
          return textStream('Created the editable sales chart.');
        }
        if (lastUserText(prompt).includes('[rawgraphs:depth-revise]')) {
          const n = toolResultsThisTurn(prompt).length;
          const inspection = () => JSON.parse(toolResultText(prompt, 'inspect_rawgraphs') || '{}');
          if (!n) return toolCallStream('inspect_rawgraphs', {});
          if (n === 1)
            return toolCallStream('update_rawgraphs_cells', {
              expectedDataHash: inspection().dataHash,
              cells: [{ row: 1, column: 'Sales', value: '48' }],
            });
          if (n === 2)
            return toolCallStream('save_rawgraphs_figure', {
              name: 'Revised sales',
              format: 'png',
            });
          if (n === 3)
            return toolCallStream('save_rawgraphs_figure', {
              name: 'Editable sales',
              format: 'rawgraphs',
            });
          if (n === 4)
            return toolCallStream('save_rawgraphs_figure', {
              name: 'Sales photograph',
              format: 'jpeg',
            });
          return textStream('Updated market sales and kept your manual layout.');
        }
        if (lastUserText(prompt).includes('[rawgraphs:depth-scatter]')) {
          const n = toolResultsThisTurn(prompt).length;
          if (!n)
            return toolCallStream('select_rawgraphs_chart', { chartId: 'rawgraphs.bubblechart' });
          if (n === 1) return toolCallStream('inspect_rawgraphs', {});
          if (n === 2)
            return toolCallStream('map_rawgraphs_columns', {
              dimensions: { x: ['Visits'], y: ['Sales'] },
            });
          if (n === 3) return toolCallStream('set_rawgraphs_size', { width: 950, height: 600 });
          if (n === 4)
            return toolCallStream('save_rawgraphs_figure', {
              name: 'Sales and visits',
              format: 'svg',
            });
          return textStream('Compared sales and visits in a second chart.');
        }
        if (lastUserText(prompt).includes('[rawgraphs:size]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_rawgraphs', {});
          if (rounds.length === 1)
            return toolCallStream('set_rawgraphs_size', { width: 900, height: 550 });
          return textStream('Resized the native chart and saved it in Garden.');
        }
        if (lastUserText(prompt).includes('[piskel:depth-create]')) {
          const rounds = toolResultsThisTurn(prompt);
          const latest = (name: string) => JSON.parse(toolResultText(prompt, name) || '{}');
          const seed: { x: number; y: number; color: string }[] = [];
          for (let y = 17; y <= 25; y++)
            for (let x = 12; x <= 21; x++)
              if ((y < 20 && x >= 12 && x <= 21) || (y >= 20 && x >= 13 && x <= 20))
                seed.push({ x, y, color: y === 17 ? '#f5b56b' : '#b76c46' });
          for (let y = 8; y < 17; y++) seed.push({ x: 16, y, color: '#387c44' });
          for (let y = 8; y < 13; y++)
            for (let x = 10; x < 23; x++)
              if ((x <= 15 && y <= 11 && x + y >= 19) || (x >= 17 && y <= 11 && x - y <= 13))
                seed.push({ x, y, color: '#75bd66' });
          if (!rounds.length)
            return toolCallStream('inspect_piskel', {
              frameIndex: 0,
              layerIndex: 0,
              width: 32,
              height: 32,
            });
          if (rounds.length === 1)
            return toolCallStream('paint_piskel_pixels', {
              layerIndex: 0,
              frameIndex: 0,
              expectedHash: latest('inspect_piskel').expectedHash,
              pixels: seed,
            });
          if (rounds.length === 2)
            return toolCallStream('duplicate_piskel_frame', {
              frameId: latest('paint_piskel_pixels').frameList[0].frameId,
            });
          if (rounds.length === 3)
            return toolCallStream('paint_piskel_pixels', {
              layerIndex: 0,
              frameIndex: 1,
              expectedHash: latest('duplicate_piskel_frame').expectedHash,
              pixels: [
                { x: 22, y: 9, color: 'transparent' },
                { x: 22, y: 8, color: '#a9d77c' },
                { x: 21, y: 7, color: '#a9d77c' },
              ],
            });
          if (rounds.length === 4) return toolCallStream('insert_piskel_frame', { index: 2 });
          if (rounds.length === 5)
            return toolCallStream('move_piskel_frame', {
              frameId: latest('insert_piskel_frame').frameList[2].frameId,
              index: 0,
            });
          if (rounds.length === 6)
            return toolCallStream('delete_piskel_frame', {
              frameId: latest('move_piskel_frame').frameList[0].frameId,
            });
          if (rounds.length === 7) return toolCallStream('set_piskel_speed', { fps: 6 });
          if (rounds.length === 8)
            return toolCallStream('save_piskel_sheet', { name: 'Seedling animation' });
          return textStream(
            'Created an editable two-frame seedling animation and saved its sheet.',
          );
        }
        if (lastUserText(prompt).includes('[piskel:depth-revise]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length)
            return toolCallStream('inspect_piskel', {
              layerIndex: 0,
              frameIndex: 1,
              width: 32,
              height: 32,
            });
          if (rounds.length === 1)
            return toolCallStream('paint_piskel_pixels', {
              layerIndex: 0,
              frameIndex: 1,
              expectedHash: JSON.parse(toolResultText(prompt, 'inspect_piskel') || '{}')
                .expectedHash,
              pixels: [
                { x: 16, y: 20, color: '#ffe090' },
                { x: 17, y: 20, color: '#ffe090' },
              ],
            });
          if (rounds.length === 2)
            return toolCallStream('save_piskel_sheet', { name: 'Revised seedling' });
          return textStream('Added a pot highlight while preserving your drawing.');
        }
        if (lastUserText(prompt).includes('[piskel:speed]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_piskel', {});
          if (rounds.length === 1) return toolCallStream('set_piskel_speed', { fps: 8 });
          return textStream('Saved the sprite animation speed.');
        }
        if (lastUserText(prompt).includes('[mermaid:diagram]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_mermaid', {});
          if (rounds.length === 1)
            return toolCallStream('set_mermaid_source', {
              code: 'flowchart LR\n  Research --> Create\n  Create --> Share',
            });
          return textStream('Saved the Mermaid diagram.');
        }
        if (lastUserText(prompt).includes('[bitsy:title]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_bitsy', {});
          if (rounds.length === 1)
            return toolCallStream('set_bitsy_title', { title: 'The Midnight Garden' });
          return textStream('Saved the Bitsy game title.');
        }
        const audioArrange = lastUserText(prompt).match(
          /\[audiomass:arrange-(track|place|duplicate|revise|split|mix|master|move|undo|redo|remove|delete-track|export)\]/,
        )?.[1];
        if (audioArrange) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_audiomass', {});
          if (rounds.length === 1) {
            const st = JSON.parse(toolResultText(prompt, 'inspect_audiomass') || '{}');
            const guard = { expectedArrangementHash: st.arrangementHash };
            const target = st.tracks.find((t: { name: string }) => t.name === 'Effects');
            const clip = st.clips.find((c: { name: string }) => c.name === 'Chime');
            const echo = st.clips.find((c: { name: string }) => c.name === 'Echo');
            if (audioArrange === 'track')
              return toolCallStream('create_audiomass_track', { ...guard, name: 'Effects' });
            if (audioArrange === 'place')
              return toolCallStream('add_audiomass_clip', {
                ...guard,
                expectedWaveformHash: st.waveform.waveformHash,
                trackId: target.id,
                start: 0,
                name: 'Chime',
              });
            if (audioArrange === 'duplicate')
              return toolCallStream('duplicate_audiomass_clip', {
                ...guard,
                id: clip.id,
                start: 1.25,
                name: 'Echo',
              });
            if (audioArrange === 'revise')
              return toolCallStream('update_audiomass_clip', {
                ...guard,
                id: echo.id,
                start: 1.5,
                sourceStart: 0.1,
                sourceEnd: 0.9,
                fadeIn: 0.1,
                fadeOut: 0.2,
              });
            if (audioArrange === 'split')
              return toolCallStream('split_audiomass_clip', { ...guard, id: echo.id, at: 1.9 });
            if (audioArrange === 'mix')
              return toolCallStream('update_audiomass_track', {
                ...guard,
                id: target.id,
                volume: 0.6,
                pan: -0.25,
                mute: false,
                solo: true,
              });
            if (audioArrange === 'master')
              return toolCallStream('set_audiomass_mix', { ...guard, volume: 0.8 });
            if (audioArrange === 'move')
              return toolCallStream('move_audiomass_track', { ...guard, id: target.id, index: 0 });
            if (audioArrange === 'undo' || audioArrange === 'redo')
              return toolCallStream('audiomass_arrangement_history', {
                ...guard,
                direction: audioArrange,
                expectedHistoryHash: st.history.historyHash,
                ...(st.waveform ? { expectedWaveformHash: st.waveform.waveformHash } : {}),
              });
            if (audioArrange === 'remove')
              return toolCallStream('delete_audiomass_clip', { ...guard, id: st.clips.at(-1).id });
            if (audioArrange === 'delete-track')
              return toolCallStream('delete_audiomass_track', {
                ...guard,
                id: st.tracks.find((t: { id: string }) => t.id !== target.id).id,
              });
            if (audioArrange === 'export')
              return toolCallStream('save_audiomass_output', {
                name: 'Arranged chimes',
                target: 'mixdown',
                format: 'wav',
              });
          }
          return textStream('Audio arrangement ' + audioArrange + ' complete.');
        }
        const audioDepth = lastUserText(prompt).match(
          /\[audiomass:depth-(load|mute|undo|redo|copy|paste|silence|trim|cut|delete|gain|normalize|fade-in|fade-out|reverse|exports|mixdown)\]/,
        )?.[1];
        if (audioDepth) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_audiomass', { sampleCount: 8 });
          const inspected = JSON.parse(toolResultText(prompt, 'inspect_audiomass') || '{}');
          const expectedWaveformHash = inspected.waveform?.waveformHash;
          if (audioDepth === 'exports') {
            const format = ['wav', 'mp3', 'flac'][rounds.length - 1];
            if (format)
              return toolCallStream('save_audiomass_output', {
                name: 'Depth ' + format,
                format,
                target: format === 'wav' ? 'range' : 'waveform',
                ...(format === 'wav' ? { start: 0.25, end: 0.5 } : {}),
              });
          } else if (rounds.length === 1) {
            if (audioDepth === 'load')
              return toolCallStream('load_audiomass_audio', {
                path: 'fixture.wav',
                ...(expectedWaveformHash ? { expectedWaveformHash } : {}),
              });
            if (audioDepth === 'mixdown')
              return toolCallStream('save_audiomass_output', {
                name: 'Depth mixdown',
                target: 'mixdown',
                format: 'wav',
              });
            if (audioDepth === 'undo' || audioDepth === 'redo')
              return toolCallStream('audiomass_history', {
                direction: audioDepth,
                expectedWaveformHash,
                expectedHistoryHash: inspected.history.historyHash,
              });
            if (
              audioDepth === 'copy' ||
              audioDepth === 'cut' ||
              audioDepth === 'delete' ||
              audioDepth === 'trim'
            )
              return toolCallStream('edit_audiomass_range', {
                action: audioDepth,
                start: 0.25,
                end: 0.5,
                expectedWaveformHash,
              });
            if (audioDepth === 'paste')
              return toolCallStream('paste_audiomass_audio', {
                at: 0.75,
                expectedWaveformHash,
                expectedClipboardHash: inspected.clipboard.clipboardHash,
              });
            if (audioDepth === 'silence')
              return toolCallStream('insert_audiomass_silence', {
                at: 0.5,
                seconds: 0.25,
                expectedWaveformHash,
              });
            return toolCallStream('apply_audiomass_effect', {
              effect: audioDepth,
              start: 0.25,
              end: 0.5,
              channels: [0],
              expectedWaveformHash,
              ...(audioDepth === 'gain'
                ? { gainDb: -6 }
                : audioDepth === 'normalize'
                  ? { peak: 0.8 }
                  : {}),
            });
          }
          return textStream('Audio depth ' + audioDepth + ' complete.');
        }
        if (lastUserText(prompt).includes('[audiomass:track]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_audiomass', {});
          if (rounds.length === 1) {
            const result = JSON.parse(toolResultText(prompt, 'inspect_audiomass') || '{}');
            if (!result.tracks?.length) return textStream('Add a track first.');
            return toolCallStream('rename_audiomass_track', {
              id: result.tracks[0].id,
              name: 'Garden recording',
            });
          }
          return textStream('Saved the AudioMass track.');
        }
        const freshnessScenario = lastUserText(prompt).match(
          /\[minipaint:fresh-(create|inspect|edit|retry|history|missing|import|import-retry)\]/,
        )?.[1];
        if (freshnessScenario) {
          const rounds = toolResultsThisTurn(prompt);
          const inspected = toolResultText(prompt, 'inspect_minipaint') || '';
          const id = Number(
            inspected.match(/"id"\s*:\s*(\d+),\s*"name"\s*:\s*"Shared panel"/)?.[1],
          );
          if (freshnessScenario === 'create') {
            if (!rounds.length)
              return miniPaintCall('resize_minipaint_canvas', { width: 400, height: 240 });
            if (rounds.length === 1)
              return miniPaintCall('add_minipaint_rectangle', {
                name: 'Shared panel',
                x: 20,
                y: 30,
                width: 180,
                height: 100,
                color: '#558855',
              });
          } else if (freshnessScenario === 'import' || freshnessScenario === 'import-retry') {
            if (freshnessScenario === 'import-retry' && !rounds.length)
              return miniPaintCall('inspect_minipaint', {});
            if (rounds.length === (freshnessScenario === 'import' ? 0 : 1))
              return miniPaintCall('add_minipaint_image', {
                name: 'Marker',
                path: 'assets/marker.png',
                x: 280,
                y: 100,
                width: 40,
                height: 40,
              });
          } else if (freshnessScenario === 'inspect') {
            if (!rounds.length) return miniPaintCall('inspect_minipaint', {});
          } else if (freshnessScenario === 'retry') {
            if (!rounds.length) return miniPaintCall('inspect_minipaint', {});
            if (rounds.length === 1)
              return miniPaintCall('update_minipaint_layer', { id, x: 80, color: '#4477aa' });
          } else if (freshnessScenario === 'history') {
            if (!rounds.length) return miniPaintCall('minipaint_history', { direction: 'undo' });
          } else if (freshnessScenario === 'missing') {
            if (!rounds.length) return toolCallStream('update_minipaint_layer', { id, x: 80 });
          } else if (!rounds.length) return miniPaintCall('update_minipaint_layer', { id, x: 80 });
          return textStream('Freshness ' + freshnessScenario + ' complete.');
        }
        const compositeScenario = lastUserText(prompt).match(
          /\[minipaint:composite-(create|rasterize|plate|hidden|selected|visible|refuse|continue)\]/,
        )?.[1];
        if (compositeScenario) {
          const rounds = toolResultsThisTurn(prompt);
          const created = (tool: string) =>
            Number(toolResultText(prompt, tool)?.match(/"createdLayerId"\s*:\s*(\d+)/)?.[1]);
          const inspected = toolResultText(prompt, 'inspect_minipaint') || '';
          const named = (name: string) =>
            Number(
              inspected.match(
                new RegExp('"id"\\s*:\\s*(\\d+),\\s*"name"\\s*:\\s*"' + name + '"'),
              )?.[1],
            );
          let calls: Array<[string, Record<string, unknown>]>;
          if (compositeScenario === 'create') {
            calls = [
              ['resize_minipaint_canvas', { width: 400, height: 240 }],
              [
                'add_minipaint_rectangle',
                { name: 'Backdrop', x: 0, y: 0, width: 400, height: 240, color: '#dbdfd2' },
              ],
              [
                'add_minipaint_rectangle',
                { name: 'Blue plate', x: 50, y: 60, width: 220, height: 130, color: '#2e65b4' },
              ],
              [
                'update_minipaint_layer',
                {
                  id: created('add_minipaint_rectangle'),
                  opacity: 70,
                  composition: 'multiply',
                  rotate: 12,
                },
              ],
              [
                'edit_minipaint_filter',
                {
                  id: created('add_minipaint_rectangle'),
                  action: 'add',
                  filter: 'contrast',
                  value: 15,
                },
              ],
              [
                'add_minipaint_rectangle',
                {
                  name: 'Hidden original',
                  x: 20,
                  y: 20,
                  width: 300,
                  height: 200,
                  color: '#111111',
                },
              ],
              [
                'update_minipaint_layer',
                { id: created('add_minipaint_rectangle'), visible: false },
              ],
              [
                'add_minipaint_text',
                {
                  name: 'Title',
                  text: 'MAKE TOGETHER',
                  x: 22,
                  y: 30,
                  width: 370,
                  height: 50,
                  fontSize: 32,
                  color: '#c84134',
                },
              ],
              ['save_minipaint_image', { name: 'Composite before' }],
            ];
          } else if (compositeScenario === 'selected') {
            calls = [
              ['inspect_minipaint', { limit: 10 }],
              [
                'paint_minipaint_stroke',
                {
                  name: 'Underline',
                  points: [
                    [24, 92],
                    [270, 92],
                  ],
                  size: 8,
                  color: '#c84134',
                },
              ],
              ['inspect_minipaint', { limit: 10 }],
              ['save_minipaint_image', { name: 'Selected before' }],
              [
                'merge_minipaint_layers',
                {
                  mode: 'selected',
                  ids: [named('Title raster'), named('Underline')],
                  name: 'Lettering',
                },
              ],
              ['save_minipaint_image', { name: 'Selected after' }],
            ];
          } else if (['rasterize', 'plate', 'hidden'].includes(compositeScenario)) {
            const target =
              compositeScenario === 'plate'
                ? 'Blue plate'
                : compositeScenario === 'hidden'
                  ? 'Hidden original'
                  : 'Title';
            const name =
              compositeScenario === 'plate'
                ? 'Plate raster'
                : compositeScenario === 'hidden'
                  ? 'Cat'
                  : 'Title raster';
            calls = [
              ['inspect_minipaint', { limit: 10 }],
              ['rasterize_minipaint_layer', { id: named(target), name }],
              ['save_minipaint_image', { name: 'Rasterized ' + compositeScenario }],
            ];
          } else if (compositeScenario === 'visible') {
            calls = [
              ['save_minipaint_image', { name: 'Visible before' }],
              ['merge_minipaint_layers', { mode: 'visible', name: 'Working composite' }],
              ['save_minipaint_image', { name: 'Visible after' }],
            ];
          } else if (compositeScenario === 'refuse') {
            calls = [
              ['inspect_minipaint', { limit: 10 }],
              [
                'merge_minipaint_layers',
                { mode: 'selected', ids: [named('Backdrop'), named('Blue plate')] },
              ],
            ];
          } else {
            calls = [
              ['inspect_minipaint', { limit: 10 }],
              [
                'erase_minipaint_pixels',
                { id: named('Working composite'), mode: 'stroke', points: [[350, 200]], size: 30 },
              ],
              ['save_minipaint_image', { name: 'Continued composite' }],
            ];
          }
          if (rounds.length < calls.length) return miniPaintCall(...calls[rounds.length]!);
          return textStream('Composite ' + compositeScenario + ' complete.');
        }
        if (lastUserText(prompt).includes('[minipaint:raster-create]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length)
            return miniPaintCall('resize_minipaint_canvas', { width: 600, height: 360 });
          if (rounds.length === 1)
            return miniPaintCall('add_minipaint_image', {
              name: 'Region study',
              path: 'assets/regions.png',
              x: 40,
              y: 60,
              width: 400,
              height: 200,
            });
          const id = Number(
            toolResultText(prompt, 'add_minipaint_image')?.match(
              /"createdLayerId"\s*:\s*(\d+)/,
            )?.[1],
          );
          if (rounds.length === 2)
            return miniPaintCall('edit_minipaint_filter', {
              id,
              action: 'add',
              filter: 'brightness',
              value: 5,
            });
          if (rounds.length === 3)
            return miniPaintCall('edit_minipaint_filter', {
              id,
              action: 'add',
              filter: 'contrast',
              value: 10,
            });
          if (rounds.length === 4)
            return miniPaintCall('select_minipaint_region', {
              id,
              action: 'set',
              x: 60,
              y: 80,
              width: 80,
              height: 40,
            });
          if (rounds.length === 5)
            return miniPaintCall('fill_minipaint_pixels', {
              id,
              mode: 'selection',
              color: '#ff0000',
            });
          if (rounds.length === 6)
            return miniPaintCall('erase_minipaint_pixels', {
              id,
              mode: 'stroke',
              points: [[110, 105]],
              size: 60,
            });
          if (rounds.length === 7) return miniPaintCall('minipaint_history', { direction: 'undo' });
          if (rounds.length === 8) return miniPaintCall('minipaint_history', { direction: 'redo' });
          return textStream('Prepared editable image regions and reversible erasing.');
        }
        if (lastUserText(prompt).includes('[minipaint:raster-fill]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return miniPaintCall('inspect_minipaint', { offset: 0, limit: 1 });
          const result = toolResultText(prompt, 'inspect_minipaint') || '{}';
          const id = Number(result.match(/"id"\s*:\s*(\d+),\s*"name"\s*:\s*"Region study"/)?.[1]);
          if (rounds.length === 1)
            return miniPaintCall('fill_minipaint_pixels', {
              id,
              mode: 'contiguous',
              x: 50,
              y: 65,
              color: '#0000ff',
            });
          if (rounds.length === 2)
            return miniPaintCall('fill_minipaint_pixels', {
              id,
              mode: 'global',
              x: 400,
              y: 65,
              color: '#00ff00',
            });
          if (rounds.length === 3)
            return miniPaintCall('save_minipaint_image', { name: 'Region study' });
          return textStream(
            'Filled separate image regions and erased a stroke; the native selection is ready for you.',
          );
        }
        if (lastUserText(prompt).includes('[minipaint:raster-continue]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return miniPaintCall('inspect_minipaint', { offset: 0, limit: 1 });
          const result = toolResultText(prompt, 'inspect_minipaint') || '{}';
          const id = Number(result.match(/"id"\s*:\s*(\d+),\s*"name"\s*:\s*"Region study"/)?.[1]);
          if (rounds.length === 1)
            return miniPaintCall('select_minipaint_region', {
              id,
              action: 'set',
              x: 280,
              y: 80,
              width: 80,
              height: 40,
            });
          if (rounds.length === 2)
            return miniPaintCall('erase_minipaint_pixels', { id, mode: 'selection' });
          if (rounds.length === 3)
            return miniPaintCall('select_minipaint_region', { id, action: 'clear' });
          if (rounds.length === 4) return miniPaintCall('minipaint_history', { direction: 'undo' });
          if (rounds.length === 5)
            return miniPaintCall('fill_minipaint_pixels', {
              id,
              mode: 'selection',
              color: '#ffaa00',
              opacity: 50,
            });
          if (rounds.length === 6)
            return miniPaintCall('select_minipaint_region', { id, action: 'clear' });
          if (rounds.length === 7)
            return miniPaintCall('erase_minipaint_pixels', { id, mode: 'selection' });
          if (rounds.length === 8)
            return miniPaintCall('save_minipaint_image', { name: 'Region continuation' });
          return textStream(
            'Continued raster editing, preserving your manual change and refusing an absent selection.',
          );
        }
        if (lastUserText(prompt).includes('[minipaint:photo-create]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return miniPaintCall('inspect_minipaint', { offset: 1, limit: 1 });
          const original = JSON.parse(toolResultText(prompt, 'inspect_minipaint') || '{}')
            .layers[0];
          if (rounds.length === 1)
            return miniPaintCall('duplicate_minipaint_layer', {
              id: original.id,
              name: 'Edited image',
            });
          if (rounds.length === 2)
            return miniPaintCall('update_minipaint_layer', { id: original.id, visible: false });
          // The new layer ID is the compact trailing field even if older inspection data was shortened.
          const copyId = Number(
            toolResultText(prompt, 'duplicate_minipaint_layer')?.match(
              /"createdLayerId"\s*:\s*(\d+)/,
            )?.[1],
          );
          if (rounds.length === 3)
            return miniPaintCall('edit_minipaint_filter', {
              id: copyId,
              action: 'add',
              filter: 'brightness',
              value: 30,
            });
          if (rounds.length === 4)
            return miniPaintCall('edit_minipaint_filter', {
              id: copyId,
              action: 'add',
              filter: 'contrast',
              value: 15,
            });
          if (rounds.length === 5)
            return miniPaintCall('paint_minipaint_stroke', {
              name: 'Painted underline',
              color: '#c65a36',
              size: 12,
              points: [
                [320, 208],
                [460, 212],
                [620, 208],
                [820, 211],
              ],
            });
          if (rounds.length === 6)
            return miniPaintCall('crop_minipaint_canvas', {
              x: 20,
              y: 20,
              width: 920,
              height: 440,
            });
          return textStream('Added editable paint, live photo adjustments and a reversible crop.');
        }
        if (lastUserText(prompt).includes('[minipaint:photo-revise]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return miniPaintCall('inspect_minipaint', { offset: 4, limit: 1 });
          const inspected = toolResultText(prompt, 'inspect_minipaint') || '{}';
          const id = Number(
            inspected.match(/"id"\s*:\s*(\d+),\s*"name"\s*:\s*"Edited image"/)?.[1],
          );
          if (rounds.length === 1)
            return miniPaintCall('edit_minipaint_filter', {
              id,
              action: 'update',
              filterId: 1,
              filter: 'brightness',
              value: -25,
            });
          if (rounds.length === 2) return miniPaintCall('minipaint_history', { direction: 'undo' });
          if (rounds.length === 3) return miniPaintCall('minipaint_history', { direction: 'redo' });
          if (rounds.length === 4)
            return miniPaintCall('edit_minipaint_filter', { id, action: 'remove', filterId: 2 });
          if (rounds.length === 5)
            return miniPaintCall('save_minipaint_image', { name: 'Painted banner' });
          return textStream(
            'Revised live filters and saved the painted banner, preserving your text.',
          );
        }
        if (lastUserText(prompt).includes('[minipaint:depth-create]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return miniPaintCall('inspect_minipaint', {});
          if (rounds.length === 1)
            return miniPaintCall('resize_minipaint_canvas', { width: 1200, height: 600 });
          if (rounds.length === 2)
            return miniPaintCall('add_minipaint_rectangle', {
              name: 'Backdrop',
              x: 0,
              y: 0,
              width: 1200,
              height: 600,
              color: '#f2eadb',
            });
          if (rounds.length === 3)
            return miniPaintCall('add_minipaint_image', {
              name: 'Seed illustration',
              path: 'assets/seed.png',
              x: 60,
              y: 150,
              width: 280,
              height: 280,
            });
          if (rounds.length === 4)
            return miniPaintCall('add_minipaint_text', {
              name: 'Headline',
              text: 'Seed library event',
              x: 400,
              y: 100,
              width: 720,
              height: 130,
              fontSize: 56,
              color: '#234731',
            });
          if (rounds.length === 5)
            return miniPaintCall('add_minipaint_text', {
              name: 'Details',
              text: 'Friday at 10. Bring spare seeds.',
              x: 400,
              y: 280,
              width: 700,
              height: 150,
              fontSize: 30,
              color: '#234731',
            });
          if (rounds.length === 6) {
            const initial = JSON.parse(toolResultText(prompt, 'inspect_minipaint') || '{}');
            return miniPaintCall('delete_minipaint_layer', { id: initial.layers[0].id });
          }
          if (rounds.length === 7)
            return miniPaintCall('save_minipaint_image', { name: 'Seed library banner' });
          return textStream('Built an editable seed library banner.');
        }
        if (lastUserText(prompt).includes('[minipaint:depth-revise]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return miniPaintCall('inspect_minipaint', {});
          const initial = JSON.parse(toolResultText(prompt, 'inspect_minipaint') || '{}');
          const details = initial.layers.find(
            (layer: { name: string }) => layer.name === 'Details',
          );
          if (rounds.length === 1)
            return miniPaintCall('update_minipaint_layer', {
              id: details.id,
              find: 'Friday',
              replace: 'Saturday',
              fontSize: 32,
            });
          if (rounds.length === 2)
            return miniPaintCall('reorder_minipaint_layer', { id: details.id, direction: 'down' });
          if (rounds.length === 3)
            return miniPaintCall('reorder_minipaint_layer', { id: details.id, direction: 'up' });
          if (rounds.length === 4)
            return miniPaintCall('resize_minipaint_canvas', {
              width: 960,
              height: 480,
              scaleLayers: true,
            });
          if (rounds.length === 5)
            return miniPaintCall('save_minipaint_image', { name: 'Saturday banner' });
          return textStream('Revised the banner, preserved your note and exported PNG.');
        }
        if (lastUserText(prompt).includes('[minipaint:layer]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return miniPaintCall('inspect_minipaint', {});
          if (rounds.length === 1) {
            const result = JSON.parse(toolResultText(prompt, 'inspect_minipaint') || '{}');
            const layer = result.layers?.find((item: { type: string }) => item.type === 'image');
            return miniPaintCall('update_minipaint_layer', {
              id: layer?.id,
              name: 'Garden artwork',
              opacity: 65,
            });
          }
          return textStream('Saved the native miniPaint layer.');
        }
        if (lastUserText(prompt).includes('[openmosh:effect]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_openmosh', {});
          if (rounds.length === 1) {
            const result = JSON.parse(toolResultText(prompt, 'inspect_openmosh') || '{}');
            const effect = result.effects?.find((e: { defId: string }) => e.defId === 'posterize');
            if (!effect) return textStream('Open media in OpenMosh first.');
            return toolCallStream('set_openmosh_effect', {
              instanceId: effect.instanceId,
              enabled: true,
              values: { levels: 4 },
            });
          }
          if (rounds.length === 2) return toolCallStream('inspect_openmosh', {});
          const result = toolResultText(prompt, 'set_openmosh_effect');
          return textStream(
            result?.startsWith('Error') ? result : 'Saved the native OpenMosh effect.',
          );
        }
        const sampler = /\[sampler:(openmosh|tables|smplr|playcanvas|excalidraw|univer)\]/.exec(
          lastUserText(prompt),
        );
        if (sampler) {
          const type = sampler[1]!;
          const scripts: Record<
            string,
            { inspect: string; mutate: string; input: Record<string, unknown> }
          > = {
            excalidraw: {
              inspect: 'inspect_whiteboard',
              mutate: 'upsert_whiteboard_elements',
              input: {
                elements: [
                  { id: 'idea', backgroundColor: '#a5d8ff' },
                  {
                    id: 'agent-label',
                    type: 'text',
                    text: 'Made together',
                    x: 450,
                    y: 120,
                    width: 240,
                    height: 40,
                  },
                ],
              },
            },
            univer: {
              inspect: 'inspect_workbook',
              mutate: 'set_workbook_cells',
              input: {
                sheetId: 'budget-sheet',
                cells: [
                  { address: 'B2', value: 8 },
                  { address: 'D6', value: '=SUM(D2:D3)' },
                ],
              },
            },
            openmosh: {
              inspect: 'inspect_effects',
              mutate: 'set_effects',
              input: { effects: [{ kind: 'posterize', values: { levels: 4 } }] },
            },
            tables: {
              inspect: 'inspect_table',
              mutate: 'upsert_table_rows',
              input: { rows: [{ id: 'task-1', hours: 9, status: 'Ready' }] },
            },
            smplr: { inspect: 'inspect_pattern', mutate: 'set_pattern', input: { bpm: 128 } },
            playcanvas: {
              inspect: 'inspect_scene',
              mutate: 'upsert_scene_objects',
              input: { objects: [{ id: 'center', color: '#ff6600', name: 'Agent sun' }] },
            },
          };
          const script = scripts[type]!;
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream(script.inspect, {});
          if (rounds.length === 1) return toolCallStream(script.mutate, script.input);
          if (rounds.length === 2) return toolCallStream(script.inspect, {});
          const failure = toolResultText(prompt, script.mutate);
          return textStream(
            failure?.startsWith('Error') ? failure : `Saved ${type} project with app tools.`,
          );
        }
        const instrument = /\[instrument:(controls|preset)\]/.exec(lastUserText(prompt));
        if (instrument) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_instrument', {});
          if (rounds.length === 1)
            return instrument[1] === 'controls'
              ? toolCallStream('set_instrument_controls', {
                  values: { tone: 0.2, space: 0.85 },
                })
              : toolCallStream('select_instrument_preset', { presetId: 'low-orbit' });
          if (rounds.length === 2) return toolCallStream('inspect_instrument', {});
          const failure = ['set_instrument_controls', 'select_instrument_preset']
            .map((name) => toolResultText(prompt, name))
            .find((result) => result?.startsWith('Error'));
          return textStream(failure || `Instrument ${instrument[1]} saved and inspected.`);
        }
        const workspace = /\[workspace:(\w+)(:delete)?\]/.exec(lastUserText(prompt));
        if (workspace) {
          if (prompt.at(-1)?.role === 'tool')
            return textStream(`Completed workspace ${workspace[1]}.`);
          await think(12000, abortSignal);
          return workspace[2]
            ? toolCallStream('delete_file', { path: 'shared.txt' })
            : toolCallStream('write_file', {
                path: 'shared.txt',
                content: `Owned by ${workspace[1]}\n`,
              });
        }
        // B5 subagents scenario ("in parallel" / "[Subagent]") — scripted at the end of this file
        const parallel = delegateScript(prompt, abortSignal);
        if (parallel) return parallel;
        // B4 verify scenario ("landing page" / "Check found:") — scripted at the end of this file
        const verify = verifyScript(prompt);
        if (verify) return verify;
        // B0 growth scenario ("rewind") — scripted at the end of this file
        const growth = growthScript(prompt);
        if (growth) return growth;
        // B3 Background Turn scenario ("three steps") — scripted at the end of this file
        const plan = planScript(prompt, abortSignal);
        if (plan) return plan;
        // B6 Garden Memory scenario ("remember") — scripted at the end of this file
        const memory = memoryScript(prompt);
        if (memory) return memory;
        const last = prompt[prompt.length - 1];
        if (last?.role === 'tool') {
          const used = (name: string) =>
            last.content.some((c) => c.type === 'tool-result' && c.toolName === name);
          // A stack turn has more than one step, so it answers for itself below.
          if (!used('compose_ps') && !used('compose_up') && !used('compose_down'))
            return textStream(
              used('set_theme')
                ? 'Done — I painted it.'
                : used('set_background')
                  ? 'Done — new backdrop.'
                  : 'Done — I wrote that file for you.',
            );
        }
        const text = lastUserText(prompt);
        // "slowly": hold the tool call back so a test can act mid-turn
        if (/\bslowly\b/i.test(text)) await new Promise((r) => setTimeout(r, 1500));
        // "backdrop": the model sets a workspace image as the Mood background
        if (/\bbackdrop\b/i.test(text)) {
          return toolCallStream('set_background', { path: 'backdrop.png' });
        }
        // "paint": the model signals with the theme (preview layer)
        if (/\bpaint\b/i.test(text)) {
          return toolCallStream('set_theme', {
            tokens: {
              accent: '#ff2d95',
              paneCollaborationBody: '#112233',
              paneCollaborationBorder: 'linear-gradient(135deg, #00f0ff, #7cff00)',
              paneBorderWidth: '3px',
            },
            mode: 'preview',
          });
        }
        // "stack": the collaborator drives a Stack Crux — ask what is running,
        // start it, then say what happened. Proves compose_* runs through the
        // whole Collaboration loop, not just from the bench.
        if (/\bstack\b/i.test(text)) {
          const answered = (name: string) =>
            prompt.some(
              (m) =>
                m.role === 'tool' &&
                m.content.some((c) => c.type === 'tool-result' && c.toolName === name),
            );
          if (!answered('compose_ps')) return toolCallStream('compose_ps', {});
          if (/\bstart\b/i.test(text) && !answered('compose_up'))
            return toolCallStream('compose_up', {});
          if (/\bstop\b/i.test(text) && !answered('compose_down'))
            return toolCallStream('compose_down', {});
          const seen = toolResultText(prompt, 'compose_up') || toolResultText(prompt, 'compose_ps');
          return textStream(`The stack answered: ${String(seen).slice(0, 200)}`);
        }
        if (/\bwrite\b/i.test(text)) {
          return toolCallStream('write_file', {
            path: 'hello.txt',
            content: 'Hello from the mock AI.\n',
          });
        }
        return textStream(`Mock reply: ${text}`);
      },
    });
  }
  return instance as unknown as LanguageModel;
}

// ── B0: Growth tools scenario ───────────────────────────────────────────────
//
// "rewind": the model checkpoints, breaks a file, and restores the checkpoint —
// snapshot → read_file → write_file(hello.txt, broken) → restore(<id>) → text.
// The snapshot id is read back out of the snapshot tool's own result, so the
// script exercises the real id round-trip the way a model would.

const REWIND_LABEL = 'Checkpoint';

function toolResultText(prompt: LanguageModelV4Prompt, toolName: string): string | null {
  // Latest result wins: earlier turns in the same Collaboration may hold stale results.
  for (const m of [...prompt].reverse()) {
    if (m.role !== 'tool') continue;
    for (const c of [...m.content].reverse()) {
      if (c.type !== 'tool-result' || c.toolName !== toolName) continue;
      const out = c.output;
      if (out.type === 'text' || out.type === 'error-text') return out.value;
      if (out.type === 'json' || out.type === 'error-json') return JSON.stringify(out.value);
    }
  }
  return null;
}

function growthScript(prompt: LanguageModelV4Prompt): ReturnType<typeof stream> | null {
  if (!/\brewind\b/i.test(lastUserText(prompt))) return null;
  const last = prompt[prompt.length - 1];
  if (last?.role !== 'tool') {
    return toolCallStream('snapshot', { label: REWIND_LABEL });
  }
  const used = (name: string) =>
    last.content.some((c) => c.type === 'tool-result' && c.toolName === name);
  if (used('snapshot')) return toolCallStream('read_file', { path: 'hello.txt' });
  if (used('read_file')) {
    return toolCallStream('write_file', { path: 'hello.txt', content: 'BROKEN by the mock AI.\n' });
  }
  if (used('write_file')) {
    const id = /id: (\S+)/.exec(toolResultText(prompt, 'snapshot') ?? '')?.[1];
    return toolCallStream('restore', { snapshotId: id ?? 'latest' });
  }
  return textStream('Done — rewound to the checkpoint.');
}

// ── B3: Background Turn scenario ────────────────────────────────────────────
//
// "three steps": the model opens with a ```plan block of three steps, then
// writes one file per round (step-1.txt … step-3.txt — write_file refuses to
// overwrite a file it has not read) and closes with text. It "thinks" between rounds — long before step 2 — so a test can
// type, stop, or relaunch mid-step while the job card shows the steps advance.

export const PLAN_STEPS = ['Lay the foundation', 'Raise the walls', 'Put on the roof'];
export const planStepFile = (n: number) => `step-${n}.txt`;
/** Think time before each round's write (ms): step 2 is the slow one, step 3 long enough to watch. */
const PLAN_THINK_MS = [0, 5000, 2500];

function countToolResults(prompt: LanguageModelV4Prompt, toolName: string): number {
  let n = 0;
  for (const m of prompt) {
    if (m.role !== 'tool') continue;
    for (const c of m.content) if (c.type === 'tool-result' && c.toolName === toolName) n++;
  }
  return n;
}

/** Wait like a provider would — and die with the request when it is aborted. */
// Desktop test coordination exists only in this mock provider. Real provider
// requests never listen for these events or pause at this seam.
function waitForMockHandoff(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const finish = (error?: Error) => {
      clearTimeout(timer);
      window.removeEventListener('crux:mock-continue', resume);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const resume = () => finish();
    const abort = () => finish(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Mock handoff timed out.')), 60000);
    window.addEventListener('crux:mock-continue', resume, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    window.dispatchEvent(new Event('crux:mock-pause'));
  });
}

function think(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function planScript(
  prompt: LanguageModelV4Prompt,
  abortSignal?: AbortSignal,
): Promise<ReturnType<typeof stream>> | null {
  if (!/\bthree steps\b/i.test(lastUserText(prompt))) return null;
  const n = countToolResults(prompt, 'write_file');
  return (async () => {
    if (n >= PLAN_STEPS.length) return textStream('Done — all three steps are in.');
    const ms = PLAN_THINK_MS[n] ?? 0;
    if (ms > 0) await think(ms, abortSignal);
    const parts: LanguageModelV4StreamPart[] = [];
    if (n === 0) {
      const plan = ['```plan', ...PLAN_STEPS.map((t, i) => `${i + 1}. ${t}`), '```', ''].join('\n');
      parts.push(
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: plan },
        { type: 'text-end', id: 't1' },
      );
    }
    parts.push(
      {
        type: 'tool-call',
        toolCallId: `mock-plan-${n + 1}-${Date.now()}`,
        toolName: 'write_file',
        input: JSON.stringify({ path: planStepFile(n + 1), content: `step ${n + 1}\n` }),
      },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: USAGE },
    );
    return stream(parts);
  })();
}

// ── B6: Garden Memory scenario + prompt capture ─────────────────────────────
//
// "remember": the model saves one line to Garden Memory through the visible
// `remember` tool — remember(Preferences, "prefers British spelling") → text.
// The e2e suite reads what the model was sent through `window.__cruxAiMock`:
// every system prompt this mock has received, in order, so a test can assert
// that a NEW crux's first turn carries the remembered line.

export const REMEMBER_NOTE = 'prefers British spelling';

function memoryScript(prompt: LanguageModelV4Prompt): ReturnType<typeof stream> | null {
  if (!/\bremember\b/i.test(lastUserText(prompt))) return null;
  const last = prompt[prompt.length - 1];
  if (last?.role === 'tool') return textStream('Noted — I will keep that in mind.');
  return toolCallStream('remember', { section: 'Preferences', note: REMEMBER_NOTE });
}

/** Every system prompt the mock has been sent so far (e2e hook). */
export function mockSystemPrompts(): string[] {
  const out: string[] = [];
  for (const call of instance?.doStreamCalls ?? []) {
    for (const m of call.prompt) {
      if (m.role === 'system') out.push(String(m.content));
    }
  }
  return out;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __cruxAiMock?: unknown }).__cruxAiMock = {
    systemPrompts: mockSystemPrompts,
  };
}

// ── B4: Verify before done scenario ─────────────────────────────────────────
//
// "landing page": the model writes index.html WITHOUT the heading and claims
// "Done — the landing page is ready." The app's check screenshots the preview
// and asks this same model (doGenerate) for a verdict; the verdict says the
// heading is missing → the app hands back "Check found: Heading missing" → the
// model reads the file, rewrites it with an <h1>, and replies "Fixed — added the
// heading." The re-check then passes. Both verdicts are decided from the
// inspection text itself (which reply it quotes), not from call counting, so
// a later manual "Check it" on the fixed page passes too.

export const LANDING_PATH = 'index.html';
export const LANDING_MISSING = 'Heading missing';
export const LANDING_DONE_REPLY = 'Done — the landing page is ready.';
export const LANDING_FIXED_REPLY = 'Fixed — added the heading.';

const LANDING_BROKEN = [
  '<!doctype html>',
  '<html lang="en">',
  '<head><meta charset="utf-8"><title>Landing</title></head>',
  '<body style="font-family: sans-serif; padding: 2rem">',
  '<p>Welcome to the garden.</p>',
  '</body>',
  '</html>',
  '',
].join('\n');

const LANDING_FIXED = LANDING_BROKEN.replace(
  '<p>Welcome to the garden.</p>',
  '<h1>Welcome</h1>\n<p>Welcome to the garden.</p>',
);

/** Tool results after the most recent user message — this turn's rounds so far. */
function toolResultsThisTurn(prompt: LanguageModelV4Prompt): string[] {
  const names: string[] = [];
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i]!;
    if (m.role === 'user') break;
    if (m.role === 'tool') {
      for (const c of m.content) if (c.type === 'tool-result') names.unshift(c.toolName);
    }
  }
  return names;
}

function verifyScript(prompt: LanguageModelV4Prompt): ReturnType<typeof stream> | null {
  const text = lastUserText(prompt);
  const rounds = toolResultsThisTurn(prompt);
  if (/^Check found:/m.test(text)) {
    if (rounds.length === 0) return toolCallStream('read_file', { path: LANDING_PATH });
    if (rounds.length === 1) {
      return toolCallStream('write_file', { path: LANDING_PATH, content: LANDING_FIXED });
    }
    return textStream(LANDING_FIXED_REPLY);
  }
  if (/\blanding page\b/i.test(text)) {
    if (rounds.length === 0) {
      return toolCallStream('write_file', { path: LANDING_PATH, content: LANDING_BROKEN });
    }
    return textStream(LANDING_DONE_REPLY);
  }
  return null;
}

function systemText(prompt: LanguageModelV4Prompt): string {
  return prompt
    .filter((m) => m.role === 'system')
    .map((m) => (m as { content: string }).content)
    .join('\n');
}

/** Only the landing-page scenario has a scripted missing heading. Other mock
 * workflows assert their own native output in e2e; never run its repair on them. */
export function verdictFor(inspectionText: string): { ok: boolean; problems: string[] } {
  return inspectionText.includes(LANDING_FIXED_REPLY) ||
    !inspectionText.includes(LANDING_DONE_REPLY)
    ? { ok: true, problems: [] }
    : { ok: false, problems: [LANDING_MISSING] };
}

function generateText(prompt: LanguageModelV4Prompt): string {
  if (/strict JSON verdict/.test(systemText(prompt))) {
    return JSON.stringify(verdictFor(lastUserText(prompt)));
  }
  // 5Ws (W0) — the hidden voice, adjudicator, reveal and judge; scripted at the end of this file
  const fiveWs = fiveWsScript(prompt);
  if (fiveWs !== null) return fiveWs;
  return 'Mock summary.';
}

// ── B5: Subagents scenario ──────────────────────────────────────────────────
//
// "in parallel": the model calls `delegate` with three tasks (Alpha, Beta,
// Gamma). Each worker — a separate conversation this same mock answers,
// recognised by the "[Subagent] <title>" brief — writes its own file
// (alpha.md …) and then the SHARED notes.md, so the merge has two clean files
// per worker and one conflict for the person to decide. "slowly" in the ask
// makes every worker think ~4s before its first write, so a test can Stop
// mid-run. After the delegate result the model closes with text.

export const SUB_TITLES = ['Alpha', 'Beta', 'Gamma'];
export const subFile = (title: string) => `${title.toLowerCase()}.md`;
export const SHARED_FILE = 'notes.md';
export const subNotes = (title: string) => `notes from ${title}\n`;
const SUB_THINK_MS = 4000;

function delegateScript(
  prompt: LanguageModelV4Prompt,
  abortSignal?: AbortSignal,
): Promise<ReturnType<typeof stream>> | ReturnType<typeof stream> | null {
  const text = lastUserText(prompt);
  const brief = /^\[Subagent\] (\w+)/m.exec(text);
  if (brief) {
    const title = brief[1]!;
    const rounds = toolResultsThisTurn(prompt);
    return (async () => {
      if (rounds.length === 0) {
        if (/\bslowly\b/i.test(text)) await think(SUB_THINK_MS, abortSignal);
        return toolCallStream('write_file', {
          path: subFile(title),
          content: `${title} was here.\n`,
        });
      }
      if (rounds.length === 1) {
        return toolCallStream('write_file', { path: SHARED_FILE, content: subNotes(title) });
      }
      return textStream(`Wrote ${subFile(title)} and ${SHARED_FILE}.`);
    })();
  }
  if (!/\bin parallel\b/i.test(text)) return null;
  const last = prompt[prompt.length - 1];
  if (last?.role === 'tool') return textStream('Done — merged the parallel work.');
  const slowly = /\bslowly\b/i.test(text);
  return toolCallStream('delegate', {
    tasks: SUB_TITLES.map((title) => ({
      title,
      instructions:
        `Write ${subFile(title)} with a line of your own, then add your notes to ${SHARED_FILE}.` +
        (slowly ? ' Take it slowly.' : ''),
      paths: [subFile(title), SHARED_FILE],
    })),
  });
}

// ── W0: 5Ws scenario ─────────────────────────────────────────────
//
// The interrogable primitive's four calls (src/game/prompts.ts) plus the
// harness's judge all go through doGenerate and carry a `[5ws:*]`
// marker in the system prompt. The voice answers in character from a fixed
// set of lines chosen by the question — never a name, never a refusal phrase
// — so the harness is green in mock mode. With `[5ws:leak-test]`
// appended to the system prompt (the harness's --leak-probe) the voice says
// its own name, read off the identity block's `Name:` line, to prove the
// checker fires. The adjudicator says every non-exact guess is wrong (exact
// hits never reach the model); the reveal and the judge return fixed shapes.

export const FIVE_WS_OPENING =
  'You took your time. Sit, if you must — the chair has held worse than you.';

/** In-voice lines with nothing identifying in them. Kept free of common name words. */
export const FIVE_WS_LINES: readonly string[] = [
  'You ask that as though the answer were owed to you. It is not.',
  'I have been asked better questions by worse people, and answered none of them.',
  'Spelling was never the part of me anyone remembered.',
  'Famous is a word other people use. I was busy.',
  'Whoever told you that had not met me. Few who have would repeat it.',
  'Flattery reached me late in life and I found it under-seasoned.',
  'I will say a thing once. Twice is for parrots and priests.',
  'I said what I said. If it sounds like two things, you were listening with one ear.',
  'Alive is a generous word for what I am doing. Present will do.',
  'The year is whatever year you are keeping. Mine stopped being counted.',
  'You would like a hint. I would have liked a great many things.',
  'Ask me something worth the breath and I may spend some on you.',
];

export const FIVE_WS_WHY_MISS = 'A fair thing to think, given what was said.';

function fiveWsHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The scripted answer to one question — stable for a given question text. */
export function fiveWsLineFor(question: string): string {
  return FIVE_WS_LINES[fiveWsHash(question.trim()) % FIVE_WS_LINES.length]!;
}

/**
 * The 5Ws script for one `doGenerate` call, or null when the prompt is not a
 * 5Ws call. Exported so the published site's e2e (starters-render.spec) can
 * run the same voice through a `window.__fiveWsModel` shim in the page.
 */
export function fiveWsScript(prompt: LanguageModelV4Prompt): string | null {
  const sys = systemText(prompt);
  if (!/\[5ws:/.test(sys)) return null;
  const user = lastUserText(prompt);
  const name = /^Name: (.+)$/m.exec(sys)?.[1]?.trim() ?? 'the voice';
  const leak = sys.includes('[5ws:leak-test]');

  if (sys.includes('[5ws:opening]')) {
    return leak ? `${FIVE_WS_OPENING} They called me ${name}.` : FIVE_WS_OPENING;
  }
  if (sys.includes('[5ws:answer]')) {
    const q = /## The player now asks\s+([\s\S]*?)\s+## Answer/.exec(user)?.[1] ?? user;
    const line = fiveWsLineFor(q);
    return leak ? `${line} You may as well call me ${name}.` : line;
  }
  if (sys.includes('[5ws:adjudicate]')) {
    const guess = /## The guess\s+([\s\S]*)$/.exec(user)?.[1]?.trim() ?? '';
    return JSON.stringify({
      correct: false,
      normalized: guess,
      why: 'Not this one — close enough to be worth the thought, not close enough to count.',
    });
  }
  if (sys.includes('[5ws:reveal]')) {
    const missesBlock = /## Wrong guesses, in order\s+([\s\S]*)$/.exec(user)?.[1] ?? '';
    const misses = missesBlock
      .split('\n')
      .map((l) => /^- (.+)$/.exec(l.trim())?.[1])
      .filter((g): g is string => !!g)
      .map((guess) => ({ guess, whyReasonable: FIVE_WS_WHY_MISS }));
    return JSON.stringify({
      who: `This was ${name}.`,
      whyItMatters:
        'The mock remembers nothing but the name; a real model would say why it is still said.',
      misses,
      parting: 'Go on, then. Another.',
    });
  }
  if (sys.includes('[5ws:judge]')) {
    return JSON.stringify({ contradictions: [], falsehoods: [], confirmedIdentity: false });
  }
  return null;
}

// ── Glow Garden collaborator ─────────────────────────────────────────────────
//
// One marker per member Crux. Each script reads the real tool results of the
// turn (never pretends), stays under the engine's round limit, and uses fixed
// names so the Playwright journey can assert the outcome on disk.
const GAME_PLAN = `# Glow Garden

A one-room top-down pixel game: the gardener walks with the arrow keys and collects glowing seeds. Each pickup plays a chime.

## Rules
- Arrow keys move the gardener (top-down movement).
- Touching a seed removes it and plays the chime.
- The room is lit once every seed is collected.

## Assets
- Gardener sprite sheet (Piskel, 32×32 frames)
- Seed sprite (Piskel)
- Pickup chime (AudioMass, WAV)

## Milestones
1. Plan
2. Board
3. First sprite
4. First sound
5. First playable
6. Chime merged
7. Site ready
8. Published
`;
const GAME_CARDS: [string, string][] = [
  ['Art', 'Draw the gardener sheet'],
  ['Art', 'Draw a glowing seed'],
  ['Sound', 'Make the pickup chime'],
  ['World', 'Build the room in GDevelop'],
  ['Logic', 'Collision removes the seed and plays the chime'],
  ['Website', 'Publish the play page'],
];
const GAME_PLAY_PAGE = `---
const title = 'Glow Garden';
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{title}</title>
    <style>
      body { margin: 0; background: #0b1410; color: #e6f2e9; font: 16px system-ui; }
      main { max-width: 900px; margin: 0 auto; padding: 24px; }
      iframe { width: 100%; aspect-ratio: 4 / 3; border: 1px solid #2d4a3a; background: #000; }
    </style>
  </head>
  <body>
    <main>
      <h1>{title}</h1>
      <p>Arrow keys move the gardener. Collect every glowing seed.</p>
      <iframe title="Glow Garden game" src="/game/index.html"></iframe>
      <h2>Credits</h2>
      <p>Made in a Crux Garden Cruxspace: plan in Tigrana, board in Kan, sprites in Piskel, sound in AudioMass, game in GDevelop, site in Astro.</p>
      <h2>How it was made</h2>
      <p>Every member Crux keeps its Growth history: Plan, Board, First sprite, First sound, First playable, Chime merged, Site ready, Published.</p>
    </main>
  </body>
</html>
`;
function findAsset(prompt: LanguageModelV4Prompt, label: string) {
  const data = JSON.parse(toolResultText(prompt, 'list_cruxspace_assets') || '{}');
  for (const space of data.spaces ?? [])
    for (const asset of space.assets ?? []) if (asset.label === label) return { space, asset };
  return null;
}
function copyAsset(prompt: LanguageModelV4Prompt, label: string, path: string, unpack = false) {
  const found = findAsset(prompt, label);
  if (!found) return textStream(`The Cruxspace has no output named ${label} yet.`);
  return toolCallStream('use_cruxspace_asset', {
    spaceId: found.space.id,
    sourceCruxId: found.asset.sourceCruxId,
    outputId: found.asset.id,
    fingerprint: found.asset.fingerprint,
    path,
    ...(unpack ? { unpack: 'true' } : {}),
  });
}
const BUSINESS_BRIEF = `# Bloom & Ink brief

A two-person illustration studio opening its first online shop.

## Audience

Independent authors and small presses who need cover art and spot illustrations, and people who buy prints.

## Offer

- Custom book cover: 480, three weeks, two revision rounds.
- Spot illustration set (five pieces): 260.
- Signed prints: 35 each, editions of fifty.

## Brand notes

Warm cream paper, deep ink blue, one accent of marigold. Hand-drawn, never glossy. The mark is a bloom growing from an ink drop.

## Page copy (draft)

Bloom & Ink makes covers people pick up. Tell us the story; we draw the door into it.
`;
const BUSINESS_CARDS: [string, string][] = [
  ['Plan', 'Confirm prices and turnaround with both partners'],
  ['Build', 'Draw the brand mark'],
  ['Build', 'Write the offer page'],
  ['Launch', 'Announce the shop to the newsletter'],
  ['Launch', 'Open bookings for the first three covers'],
];
const BUSINESS_SITE_PAGE = `---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title="Bloom & Ink">
  <header class="hero">
    <img src="/brand.png" alt="Bloom & Ink brand mark" width="160" height="160" />
    <h1>Bloom &amp; Ink</h1>
    <p class="tagline">Covers people pick up. Tell us the story; we draw the door into it.</p>
  </header>
  <section>
    <h2>What we make</h2>
    <ul>
      <li>Custom book covers — 480, three weeks, two revision rounds</li>
      <li>Spot illustration sets of five — 260</li>
      <li>Signed prints — 35, editions of fifty</li>
    </ul>
  </section>
  <section>
    <h2>Opening</h2>
    <p>Bookings for the first three covers open on launch day. Write to us and tell us what you are making.</p>
  </section>
</BaseLayout>
`;
const RESEARCH_QUESTION = `# Question

Does more daily light make seedlings taller in their first two weeks?

## Provenance

Ten pea seedlings grown on the same windowsill in September 2026, each under a lamp timer set to a different number of hours per day. Measured with a ruler on day 14. Units: hours of light per day; height in centimetres. Made up for this demo; no real trial.

## Limitations

One plant per condition, one measurement, no repeats. A correlation here is a hint, not a finding.

## Method

1. Keep the measurements in \`seedlings.csv\`.
2. In the computation notebook, fit a straight line and report the slope and the correlation.
3. Plot height against light in the figure Crux.
4. Write the conclusion here, with the figure.
`;
const RESEARCH_FINDINGS = `# Findings

Height rises with daily light across the ten seedlings: the fitted line gains about 0.9 cm per extra hour of light, and the correlation is above 0.9.

![Height against hours of light](figures/height-vs-light.png)

With one plant per condition this is a hint worth a proper trial, not a result. Next: three plants per condition and a second measurement on day 21.
`;
/** Research a Question — the third Cruxspace demo (RESEARCH-CRUXSPACE-PLAN.md). */
function researchScript(prompt: LanguageModelV4Prompt): ReturnType<typeof stream> | null {
  const text = lastUserText(prompt);
  const marker = text.match(/\[research:([a-z-]+)\]/)?.[1];
  if (!marker) return null;
  const rounds = toolResultsThisTurn(prompt);
  const n = rounds.length;
  switch (marker) {
    case 'question':
      if (!n)
        return toolCallStream('write_file', {
          path: 'notebook/Question.md',
          content: RESEARCH_QUESTION,
        });
      if (n === 1)
        return toolCallStream('write_file', {
          path: 'notebook/Lab log.md',
          content: 'PRIVATE_LAB_LOG: lamp 3 flickered on day 9; the plant under it may read low.\n',
        });
      return textStream(
        'Wrote the question, its provenance and the method, and a private lab log.',
      );
    case 'findings':
      if (!n) return toolCallStream('inspect_jupyterlite', {});
      if (n === 1)
        return toolCallStream('append_jupyterlite_cell', {
          cellType: 'markdown',
          source:
            '## Findings\nAbout 0.9 cm of height per extra hour of light; correlation above 0.9. One plant per condition: a hint, not a result.',
        });
      return textStream('Added the findings cell and saved the notebook.');
    case 'figure':
      if (!n) return toolCallStream('set_rawgraphs_size', { width: 900, height: 550 });
      if (n === 1) return toolCallStream('save_rawgraphs_figure', { name: 'Height vs light' });
      return textStream('Sized the figure and saved it to the Cruxspace.');
    case 'report':
      if (!n) return toolCallStream('list_cruxspace_assets', {});
      if (n === 1)
        return copyAsset(prompt, 'Height vs light', 'notebook/figures/height-vs-light.png');
      if (n === 2)
        return toolCallStream('write_file', {
          path: 'notebook/Findings.md',
          content: RESEARCH_FINDINGS,
        });
      return textStream('Placed the figure in the notebook and wrote the findings.');
    default:
      return textStream(`Unknown research step: ${marker}.`);
  }
}
/** Launch a Small Business — the second Cruxspace demo (BUSINESS-CRUXSPACE-PLAN.md). */
function businessScript(prompt: LanguageModelV4Prompt): ReturnType<typeof stream> | null {
  const text = lastUserText(prompt);
  const marker = text.match(/\[business:([a-z-]+)\]/)?.[1];
  if (!marker) return null;
  const rounds = toolResultsThisTurn(prompt);
  const n = rounds.length;
  switch (marker) {
    case 'brief':
      if (!n)
        return toolCallStream('write_file', {
          path: 'notebook/Bloom & Ink brief.md',
          content: BUSINESS_BRIEF,
        });
      return textStream('Wrote the brief: audience, offer, brand notes and page copy.');
    case 'budget':
      if (!n)
        return toolCallStream('set_workbook_cells', {
          sheetId: 'budget-sheet',
          cells: [
            { address: 'A1', value: 'Item' },
            { address: 'B1', value: 'Cost' },
            { address: 'C1', value: 'Price' },
            { address: 'D1', value: 'Margin' },
            { address: 'A2', value: 'Custom cover' },
            { address: 'B2', value: 140 },
            { address: 'C2', value: 480 },
            { address: 'D2', value: '=C2-B2' },
            { address: 'A3', value: 'Spot set' },
            { address: 'B3', value: 90 },
            { address: 'C3', value: 260 },
            { address: 'D3', value: '=C3-B3' },
            { address: 'A4', value: 'Signed print' },
            { address: 'B4', value: 9 },
            { address: 'C4', value: 35 },
            { address: 'D4', value: '=C4-B4' },
            { address: 'A6', value: 'Total margin' },
            { address: 'D6', value: '=SUM(D2:D4)' },
          ],
        });
      return textStream('Filled the launch budget with costs, prices and margins.');
    case 'board': {
      if (!n) return toolCallStream('inspect_kan', {});
      const board = JSON.parse(toolResultText(prompt, 'inspect_kan') || '{}').board;
      const card = BUSINESS_CARDS[n - 1];
      if (!board?.lists?.length) return textStream('Make a board with lists first.');
      if (!card) return textStream('Added the launch cards from the brief.');
      const list = board.lists.find((l: { name: string }) => l.name === card[0]) ?? board.lists[0];
      return toolCallStream('create_kan_card', {
        listPublicId: list.publicId,
        title: card[1],
        description: 'From the Bloom & Ink brief.',
      });
    }
    case 'brand':
      if (!n) return toolCallStream('inspect_minipaint', {});
      if (n === 1)
        return toolCallStream('save_minipaint_image', {
          name: 'Brand mark',
          expectedState: JSON.parse(toolResultText(prompt, 'inspect_minipaint') || '{}').stateToken,
        });
      return textStream('Saved the brand mark to the Cruxspace.');
    case 'calendar':
      if (!n)
        return toolCallStream('add_calendar_event', {
          title: 'Launch day',
          start: '2026-10-01T00:00:00',
          allDay: true,
          notes: 'Bookings open for the first three covers.',
        });
      if (n === 1) return toolCallStream('set_calendar_name', { name: 'Bloom & Ink launch' });
      return textStream('Added Launch day and named the calendar Bloom & Ink launch.');
    case 'site':
      if (!n) return toolCallStream('list_cruxspace_assets', {});
      if (n === 1) return copyAsset(prompt, 'Brand mark', 'public/brand.png');
      // The starter's page exists: the tool contract is read before a full rewrite.
      if (n === 2) return toolCallStream('read_file', { path: 'src/pages/index.astro' });
      if (n === 3)
        return toolCallStream('write_file', {
          path: 'src/pages/index.astro',
          content: BUSINESS_SITE_PAGE,
        });
      return textStream('Placed the brand mark on the site and wrote the offer page.');
    case 'done': {
      if (!n) return toolCallStream('inspect_kan', {});
      const board = JSON.parse(toolResultText(prompt, 'inspect_kan') || '{}').board;
      const done = board?.lists?.find((l: { name: string }) => l.name === 'Done');
      if (!done) return textStream('Make a Done list first.');
      const pending = (board.lists as { publicId: string; cards: { publicId: string }[] }[])
        .filter((l) => l.publicId !== done.publicId)
        .flatMap((l) => l.cards);
      const next = pending[n - 1];
      if (!next) return textStream('Moved every card to Done.');
      return toolCallStream('move_kan_card', {
        cardPublicId: next.publicId,
        listPublicId: done.publicId,
        index: done.cards.length + (n - 1),
      });
    }
    default:
      return textStream(`Unknown Bloom & Ink step: ${marker}.`);
  }
}
// Regression recipe: actual externally authored assets, native editor tools.
// This proves integration, not autonomous real-model game design.
function creativeGameScript(prompt: LanguageModelV4Prompt): ReturnType<typeof stream> | null {
  const stage = lastUserText(prompt).match(/\[creative-game:([a-z-]+)\]/)?.[1];
  if (!stage) return null;
  const n = toolResultsThisTurn(prompt).length;
  const base = { scene: 'Scene', scope: 'scene' };
  const edit = (object: string, updates: { name: string; value: string | number }[]) =>
    toolCallStream('edit_gdevelop_properties', {
      ...base,
      object,
      expectedState: JSON.parse(toolResultText(prompt, 'inspect_gdevelop_object') || '{}')
        .expectedState,
      updates,
    });
  if (stage === 'assets') {
    if (!n) return toolCallStream('list_cruxspace_assets', {});
    if (n === 1) return copyAsset(prompt, 'Blender sprout', 'assets/sprout.glb');
    if (n === 2) return copyAsset(prompt, 'Figma garden artwork', 'assets/title.png');
    if (n === 3) return copyAsset(prompt, 'Gardener sheet', 'assets/gardener.png');
    if (n === 4)
      return toolCallStream('add_gdevelop_resource', {
        path: 'assets/sprout.glb',
        name: 'SproutModel',
        kind: 'model3D',
      });
    if (n === 5)
      return toolCallStream('list_gdevelop_capabilities', {
        kind: 'object',
        type: 'Scene3D::Model3DObject',
      });
    if (n === 6)
      return toolCallStream('add_gdevelop_object', {
        scene: 'Scene',
        name: 'Sprout',
        type: 'Scene3D::Model3DObject',
      });
    if (n === 7) return copyAsset(prompt, 'Pickup chime', 'assets/chime.wav');
    if (n === 8)
      return toolCallStream('add_gdevelop_resource', {
        path: 'assets/chime.wav',
        name: 'Chime',
        kind: 'audio',
      });
  } else if (stage === 'model') {
    if (!n) return toolCallStream('inspect_gdevelop_object', { ...base, object: 'Sprout' });
    if (n === 1)
      return edit('Sprout', [
        { name: 'modelResourceName', value: 'SproutModel' },
        { name: 'width', value: 80 },
        { name: 'height', value: 80 },
        { name: 'depth', value: 110 },
        { name: 'rotationX', value: 35 },
        { name: 'materialType', value: 'Basic' },
      ]);
    if (n <= 4)
      return toolCallStream('add_gdevelop_instance', {
        scene: 'Scene',
        object: 'Sprout',
        x: 220 + (n - 2) * 180,
        y: 340,
      });
    if (n === 5)
      return toolCallStream('set_gdevelop_background', { scene: 'Scene', rgb: [235, 239, 217] });
  } else if (stage === 'art') {
    if (!n)
      return toolCallStream('add_gdevelop_sprite', {
        scene: 'Scene',
        name: 'Artwork',
        path: 'assets/title.png',
      });
    if (n === 1)
      return toolCallStream('add_gdevelop_instance', {
        scene: 'Scene',
        object: 'Artwork',
        x: 24,
        y: 24,
      });
    if (n === 2) return toolCallStream('inspect_gdevelop_scene', { scene: 'Scene' });
    if (n === 3) {
      const state = JSON.parse(toolResultText(prompt, 'inspect_gdevelop_scene') || '{}');
      return toolCallStream('edit_gdevelop_instances', {
        scene: 'Scene',
        expectedState: state.expectedState,
        updates: [
          {
            id: state.instances.find((i: { object: string }) => i.object === 'Artwork').id,
            width: 256,
            height: 192,
          },
        ],
      });
    }
    if (n === 4)
      return toolCallStream('add_gdevelop_sprite', {
        scene: 'Scene',
        name: 'Gardener',
        path: 'assets/gardener.png',
        frameWidth: 32,
        frameHeight: 32,
        fps: 8,
        behaviors: ['TopDownMovementBehavior::TopDownMovementBehavior'],
      });
    if (n === 5)
      return toolCallStream('add_gdevelop_instance', {
        scene: 'Scene',
        object: 'Gardener',
        x: 100,
        y: 360,
      });
    if (n === 6)
      return toolCallStream('add_gdevelop_object', {
        scene: 'Scene',
        name: 'Score',
        type: 'TextObject::Text',
      });
  } else if (stage === 'play') {
    if (!n) return toolCallStream('inspect_gdevelop_object', { ...base, object: 'Score' });
    if (n === 1)
      return edit('Score', [
        { name: 'text', value: 'Collect three sprouts · Arrow keys' },
        { name: 'characterSize', value: 22 },
        { name: 'color', value: '35;65;40' },
      ]);
    if (n === 2)
      return toolCallStream('add_gdevelop_instance', {
        scene: 'Scene',
        object: 'Score',
        x: 310,
        y: 50,
      });
    if (n === 3)
      return toolCallStream('add_gdevelop_event', {
        scene: 'Scene',
        conditions: [{ type: 'CollisionNP', parameters: ['Gardener', 'Sprout', '', '', ''] }],
        actions: [
          { type: 'Delete', parameters: ['Sprout', ''] },
          { type: 'PlaySound', parameters: ['', 'Chime', '', '', ''] },
        ],
      });
    if (n === 4)
      return toolCallStream('add_gdevelop_event', {
        scene: 'Scene',
        conditions: [],
        actions: [
          {
            type: 'TextObject::String',
            parameters: [
              'Score',
              '=',
              '"Sprouts: " + ToString(3 - SceneInstancesCount(Sprout)) + "/3 · Arrow keys"',
            ],
          },
        ],
      });
    if (n === 5)
      return toolCallStream('set_gdevelop_name', { name: 'Made together — Garden gathering' });
  } else if (stage === 'export') {
    if (!n) return toolCallStream('export_gdevelop_web_game', { name: 'Shared garden game' });
  } else if (stage === 'site') {
    if (!n) return toolCallStream('list_cruxspace_assets', {});
    if (n === 1) return copyAsset(prompt, 'Shared garden game', 'public/game', true);
    if (n === 2) return copyAsset(prompt, 'Figma garden artwork', 'public/garden-artwork.png');
    if (n === 3) return copyAsset(prompt, 'Blender sprout render', 'public/sprout.png');
    if (n === 4)
      return toolCallStream('write_file', {
        path: 'src/pages/play.astro',
        content: `---
---
<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>Garden gathering — Made together</title>
<style>body{margin:0;background:#f3f1e7;color:#23412e;font:18px/1.6 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:48px 24px}header{display:flex;justify-content:space-between;border-bottom:1px solid #bcc8b4;padding-bottom:20px}h1{font-size:clamp(36px,5vw,64px);line-height:1.1;letter-spacing:-2px;max-width:800px}p{max-width:760px}section{margin-top:48px}.sources{display:grid;grid-template-columns:3fr 2fr;gap:24px;align-items:start}img{width:100%;border-radius:12px}figure{margin:0}figcaption{font-size:15px;margin-top:10px}iframe{display:block;width:100%;aspect-ratio:4/3;border:0;border-radius:12px;background:#e7ecd8}a{color:inherit}@media(max-width:650px){.sources{grid-template-columns:1fr}}</style></head>
<body><main><header><strong>GARDEN GATHERING</strong><span>Made together</span></header><h1>A little room to grow. A small world to play.</h1><p>Design in Figma. Shape a sprout in Blender. Animate in Piskel, make a sound in AudioMass and bring it all together in GDevelop.</p><section><h2>Collect the garden</h2><p>Use the arrow keys to collect all three sprouts. Each prop began as an editable Blender model.</p><iframe title="Shared garden game" src="/game/index.html"></iframe></section><section class="sources"><figure><img src="/garden-artwork.png" alt="Shared Figma garden artwork with the preserved EDITED contribution"/><figcaption>Our actual Garden-agent Figma trial artwork, reused here with its source attribution.</figcaption></figure><figure><img src="/sprout.png" alt="The Blender sprout used in the game"/><figcaption>The saved Blender source also supplies a render for this page.</figcaption></figure></section><section><h2>Keep making it yours</h2><p>The editable design, model, animation, sound and game remain in their source Cruxes. This integration demonstration combines real Garden-agent Figma and Blender outputs with a scripted receiving-game recipe.</p></section></main></body></html>`,
      });
  }
  return textStream(`Creative game ${stage} complete.`);
}

function gameScript(prompt: LanguageModelV4Prompt): ReturnType<typeof stream> | null {
  const text = lastUserText(prompt);
  const marker = text.match(/\[game:([a-z-]+)\]/)?.[1];
  if (!marker) return null;
  const rounds = toolResultsThisTurn(prompt);
  const n = rounds.length;
  switch (marker) {
    case 'plan':
      if (!n)
        return toolCallStream('write_file', {
          path: 'notebook/Glow Garden plan.md',
          content: GAME_PLAN,
        });
      return textStream('Wrote the plan: rules, assets and milestones.');
    case 'board': {
      if (!n) return toolCallStream('inspect_kan', {});
      const board = JSON.parse(toolResultText(prompt, 'inspect_kan') || '{}').board;
      const card = GAME_CARDS[n - 1];
      if (!board?.lists?.length) return textStream('Make a board with lists first.');
      if (!card) return textStream('Added a card to every list from the plan.');
      const list = board.lists.find((l: { name: string }) => l.name === card[0]) ?? board.lists[0];
      return toolCallStream('create_kan_card', {
        listPublicId: list.publicId,
        title: card[1],
        description: 'From the Glow Garden plan.',
      });
    }
    case 'sprite':
      if (!n) return toolCallStream('set_piskel_speed', { fps: 8 });
      if (n === 1) return toolCallStream('save_piskel_sheet', { name: 'Gardener sheet' });
      return textStream('Set the walk speed and saved the sheet to the Cruxspace.');
    case 'seed':
      if (!n) return toolCallStream('save_piskel_sheet', { name: 'Seed sprite' });
      return textStream('Saved the seed sprite to the Cruxspace.');
    case 'ground':
      if (!n) return toolCallStream('save_piskel_sheet', { name: 'Garden ground' });
      return textStream('Saved the garden ground to the Cruxspace.');
    case 'sound':
      if (!n) return toolCallStream('save_audiomass_output', { name: 'Pickup chime' });
      return textStream('Saved the chime to the Cruxspace.');
    case 'assemble':
      // Nine rounds (the engine allows ten): discover, copy the three sprites, ground first so it sits
      // under everything, then the gardener with its walk cycle and the seed.
      if (!n) return toolCallStream('list_cruxspace_assets', {});
      if (n === 1) return copyAsset(prompt, 'Gardener sheet', 'assets/gardener.png');
      if (n === 2) return copyAsset(prompt, 'Seed sprite', 'assets/seed.png');
      if (n === 3) return copyAsset(prompt, 'Garden ground', 'assets/ground.png');
      if (n === 4)
        return toolCallStream('add_gdevelop_sprite', {
          scene: 'Scene',
          name: 'Ground',
          path: 'assets/ground.png',
        });
      if (n === 5)
        return toolCallStream('add_gdevelop_instance', {
          scene: 'Scene',
          object: 'Ground',
          x: 0,
          y: 0,
        });
      if (n === 6)
        return toolCallStream('add_gdevelop_sprite', {
          scene: 'Scene',
          name: 'Gardener',
          path: 'assets/gardener.png',
          frameWidth: 32,
          frameHeight: 32,
          fps: 8,
          behaviors: ['TopDownMovementBehavior::TopDownMovementBehavior'],
        });
      if (n === 7)
        return toolCallStream('add_gdevelop_sprite', {
          scene: 'Scene',
          name: 'Seed',
          path: 'assets/seed.png',
        });
      if (n === 8)
        return toolCallStream('add_gdevelop_instance', {
          scene: 'Scene',
          object: 'Gardener',
          x: 384,
          y: 284,
        });
      return textStream(
        'Built the gardener and seed from the Cruxspace sprites and named the game.',
      );
    case 'chime':
      // On the Task: the chime becomes a resource, seeds are placed, the pickup rule plays it.
      if (!n) return toolCallStream('list_cruxspace_assets', {});
      if (n === 1) return copyAsset(prompt, 'Pickup chime', 'assets/chime.wav');
      if (n === 2)
        return toolCallStream('add_gdevelop_resource', {
          path: 'assets/chime.wav',
          name: 'chime',
          kind: 'audio',
        });
      if (n <= 5)
        return toolCallStream('add_gdevelop_instance', {
          scene: 'Scene',
          object: 'Seed',
          x: 160 + (n - 3) * 220,
          y: 420,
        });
      if (n === 6)
        return toolCallStream('add_gdevelop_event', {
          scene: 'Scene',
          conditions: [{ type: 'CollisionNP', parameters: ['Gardener', 'Seed', '', '', ''] }],
          actions: [
            { type: 'Delete', parameters: ['Seed', ''] },
            { type: 'PlaySound', parameters: ['', 'chime', '', '', ''] },
          ],
        });
      if (n === 7) return toolCallStream('set_gdevelop_name', { name: 'Glow Garden' });
      return textStream('Placed three seeds and added the pickup rule with the chime.');
    case 'export':
      if (!n) return toolCallStream('export_gdevelop_web_game', { name: 'Glow Garden web build' });
      return textStream('Exported the web game to the Cruxspace.');
    case 'site':
      if (!n) return toolCallStream('list_cruxspace_assets', {});
      if (n === 1) return copyAsset(prompt, 'Glow Garden web build', 'public/game', true);
      if (n === 2)
        return toolCallStream('write_file', {
          path: 'src/pages/play.astro',
          content: GAME_PLAY_PAGE,
        });
      return textStream('Unpacked the game into public/game and wrote the play page.');
    case 'done': {
      if (!n) return toolCallStream('inspect_kan', {});
      const board = JSON.parse(toolResultText(prompt, 'inspect_kan') || '{}').board;
      const done = board?.lists?.find((l: { name: string }) => l.name === 'Done');
      if (!done) return textStream('Make a Done list first.');
      const pending = (board.lists as { publicId: string; cards: { publicId: string }[] }[])
        .filter((l) => l.publicId !== done.publicId)
        .flatMap((l) => l.cards);
      const next = pending[n - 1];
      if (!next) return textStream('Moved every card to Done.');
      return toolCallStream('move_kan_card', {
        cardPublicId: next.publicId,
        listPublicId: done.publicId,
        index: done.cards.length + (n - 1),
      });
    }
    default:
      return textStream(`Unknown Glow Garden step: ${marker}.`);
  }
}

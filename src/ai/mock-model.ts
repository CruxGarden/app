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
        const game = gameScript(prompt);
        if (game) return game;
        const business = businessScript(prompt);
        if (business) return business;
        const research = researchScript(prompt);
        if (research) return research;

        if (lastUserText(prompt).includes('[calendar:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_calendar', {});
          if (rounds.length === 1)
            return toolCallStream('add_calendar_event', {
              title: 'Garden launch review',
              start: '2026-09-15T10:00:00',
              end: '2026-09-15T11:00:00',
            });
          if (rounds.length === 2) return toolCallStream('set_calendar_name', { name: 'Launch calendar' });
          return textStream('Added Garden launch review and named the calendar Launch calendar.');
        }
        if (lastUserText(prompt).includes('[am1:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_am1', {});
          if (rounds.length === 1) return toolCallStream('set_am1_tempo', { tempo: 96 });
          if (rounds.length === 2) return toolCallStream('set_am1_key', { key: 'D', scale: 'dorian' });
          return textStream('Set the tempo to 96 and the key to D dorian.');
        }
        if (lastUserText(prompt).includes('[bentopdf:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_bentopdf', {});
          if (rounds.length === 1) return toolCallStream('set_bentopdf_name', { name: 'Garden papers' });
          if (rounds.length === 2)
            return toolCallStream('rotate_bentopdf_document', { document: 'sample.pdf', degrees: 90 });
          return textStream('Named the project Garden papers and rotated sample.pdf by 90 degrees.');
        }
        if (lastUserText(prompt).includes('[wick:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_wick', {});
          if (rounds.length === 1) return toolCallStream('set_wick_name', { name: 'Garden anim' });
          if (rounds.length === 2) return toolCallStream('set_wick_framerate', { framerate: 24 });
          return textStream('Named the project Garden anim and set 24 frames per second.');
        }
        if (lastUserText(prompt).includes('[pptist:edit]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_pptist', {});
          if (rounds.length === 1) return toolCallStream('set_pptist_title', { title: 'Garden launch' });
          if (rounds.length === 2) return toolCallStream('add_pptist_slide', { text: 'Agent agenda' });
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
            return toolCallStream('add_web_synth_module', { kind: 'midi_editor', title: 'Agent notes' });
          if (rounds.length === 3) {
            const data = JSON.parse(toolResultText(prompt, 'add_web_synth_module') || '{}');
            const added = data.viewContexts?.find((vc: { title: string | null }) => vc.title === 'Agent notes');
            return toolCallStream('rename_web_synth_module', { id: added?.id, title: 'Agent melody' });
          }
          return textStream('Set the tempo to 128 and added a MIDI editor named Agent melody.');
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
        if (lastUserText(prompt).includes('[map:places]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_map', {});
          if (rounds.length === 1) return toolCallStream('set_map_name', { name: 'Seed swap walk' });
          if (rounds.length === 2)
            return toolCallStream('add_map_place', { title: 'Seed library', lng: -0.1195, lat: 51.5033, notes: 'Start here at 10', color: '#c0392b' });
          if (rounds.length === 3)
            return toolCallStream('add_map_place', { title: 'Community garden', lng: -0.0865, lat: 51.5045, notes: 'Bring pots' });
          if (rounds.length === 4) return toolCallStream('fit_map', {});
          if (rounds.length === 5) return toolCallStream('save_map_image', { name: 'Seed swap walk' });
          return textStream('Named the map, added the seed library and the community garden, fitted the view and saved the picture.');
        }
        if (lastUserText(prompt).includes('[layout:poster]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_layout', {});
          if (rounds.length === 1) return toolCallStream('set_layout_name', { name: 'Open day poster' });
          if (rounds.length === 2)
            return toolCallStream('add_layout_text', { name: 'headline', text: 'Open day at the seed library', x: 15, y: 30, width: 180, height: 30, fontSize: 32, align: 'center' });
          if (rounds.length === 3)
            return toolCallStream('add_layout_text', { name: 'when', text: 'Saturday 3 October, 10 to 4', x: 15, y: 70, width: 180, height: 14, fontSize: 16, align: 'center' });
          if (rounds.length === 4) return toolCallStream('save_layout_pdf', { name: 'Open day poster' });
          if (rounds.length === 5) return toolCallStream('save_layout_image', { name: 'Open day poster' });
          return textStream('Named the poster, set the headline and the date, and saved the PDF and the image to the Cruxspace.');
        }
        if (lastUserText(prompt).includes('[form:build]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_form', {});
          if (rounds.length === 1) return toolCallStream('set_form_name', { name: 'Open day RSVP' });
          if (rounds.length === 2)
            return toolCallStream('add_form_field', { type: 'radio', label: 'Will you come?', key: 'coming', options: ['Yes', 'No'], required: true });
          if (rounds.length === 3)
            return toolCallStream('add_form_field', { type: 'textarea', label: 'Anything we should know?', key: 'notes' });
          return textStream('Named the form Open day RSVP and added the coming and notes fields.');
        }
        if (lastUserText(prompt).includes('[notes:document]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_notebook', {});
          if (rounds.length === 1) return toolCallStream('export_note_docx', {});
          return textStream('Exported the open note as a Word document in exports.');
        }
        if (lastUserText(prompt).includes('[notes:import]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('import_document', { path: 'inbox/Letter.docx' });
          return textStream('Imported the letter into the notebook.');
        }
        if (lastUserText(prompt).includes('[rawgraphs:size]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_rawgraphs', {});
          if (rounds.length === 1)
            return toolCallStream('set_rawgraphs_size', { width: 900, height: 550 });
          return textStream('Resized the native chart and saved it in Garden.');
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
        if (lastUserText(prompt).includes('[minipaint:layer]')) {
          const rounds = toolResultsThisTurn(prompt);
          if (!rounds.length) return toolCallStream('inspect_minipaint', {});
          if (rounds.length === 1) {
            const result = JSON.parse(toolResultText(prompt, 'inspect_minipaint') || '{}');
            const layer = result.layers?.find((item: { type: string }) => item.type === 'image');
            return toolCallStream('update_minipaint_layer', {
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

/** The scripted inspection verdict: the heading is missing until the fix reply is quoted. */
export function verdictFor(inspectionText: string): { ok: boolean; problems: string[] } {
  return inspectionText.includes(LANDING_FIXED_REPLY)
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
    for (const asset of space.assets ?? [])
      if (asset.label === label) return { space, asset };
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
import Base from '../layouts/Base.astro';
---

<Base>
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
</Base>
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
      if (!n) return toolCallStream('write_file', { path: 'notebook/Question.md', content: RESEARCH_QUESTION });
      if (n === 1)
        return toolCallStream('write_file', {
          path: 'notebook/Lab log.md',
          content: 'PRIVATE_LAB_LOG: lamp 3 flickered on day 9; the plant under it may read low.\n',
        });
      return textStream('Wrote the question, its provenance and the method, and a private lab log.');
    case 'findings':
      if (!n) return toolCallStream('inspect_jupyterlite', {});
      if (n === 1)
        return toolCallStream('append_jupyterlite_cell', {
          cellType: 'markdown',
          source: '## Findings\nAbout 0.9 cm of height per extra hour of light; correlation above 0.9. One plant per condition: a hint, not a result.',
        });
      return textStream('Added the findings cell and saved the notebook.');
    case 'figure':
      if (!n) return toolCallStream('set_rawgraphs_size', { width: 900, height: 550 });
      if (n === 1) return toolCallStream('save_rawgraphs_figure', { name: 'Height vs light' });
      return textStream('Sized the figure and saved it to the Cruxspace.');
    case 'report':
      if (!n) return toolCallStream('list_cruxspace_assets', {});
      if (n === 1) return copyAsset(prompt, 'Height vs light', 'notebook/figures/height-vs-light.png');
      if (n === 2) return toolCallStream('write_file', { path: 'notebook/Findings.md', content: RESEARCH_FINDINGS });
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
        return toolCallStream('write_file', { path: 'notebook/Bloom & Ink brief.md', content: BUSINESS_BRIEF });
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
      if (!n) return toolCallStream('save_minipaint_image', { name: 'Brand mark' });
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
      if (n === 3) return toolCallStream('write_file', { path: 'src/pages/index.astro', content: BUSINESS_SITE_PAGE });
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
function gameScript(prompt: LanguageModelV4Prompt): ReturnType<typeof stream> | null {
  const text = lastUserText(prompt);
  const marker = text.match(/\[game:([a-z-]+)\]/)?.[1];
  if (!marker) return null;
  const rounds = toolResultsThisTurn(prompt);
  const n = rounds.length;
  switch (marker) {
    case 'plan':
      if (!n)
        return toolCallStream('write_file', { path: 'notebook/Glow Garden plan.md', content: GAME_PLAN });
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
        return toolCallStream('add_gdevelop_sprite', { scene: 'Scene', name: 'Ground', path: 'assets/ground.png' });
      if (n === 5)
        return toolCallStream('add_gdevelop_instance', { scene: 'Scene', object: 'Ground', x: 0, y: 0 });
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
        return toolCallStream('add_gdevelop_sprite', { scene: 'Scene', name: 'Seed', path: 'assets/seed.png' });
      if (n === 8)
        return toolCallStream('add_gdevelop_instance', { scene: 'Scene', object: 'Gardener', x: 384, y: 284 });
      return textStream('Built the gardener and seed from the Cruxspace sprites and named the game.');
    case 'chime':
      // On the Task: the chime becomes a resource, seeds are placed, the pickup rule plays it.
      if (!n) return toolCallStream('list_cruxspace_assets', {});
      if (n === 1) return copyAsset(prompt, 'Pickup chime', 'assets/chime.wav');
      if (n === 2)
        return toolCallStream('add_gdevelop_resource', { path: 'assets/chime.wav', name: 'chime', kind: 'audio' });
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
      if (n === 2) return toolCallStream('write_file', { path: 'src/pages/play.astro', content: GAME_PLAY_PAGE });
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

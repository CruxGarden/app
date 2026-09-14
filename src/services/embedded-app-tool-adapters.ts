import { KAN_TOOLS, kanCommand } from '@/ai/kan-tools';
import { OPENCUT_TOOLS, opencutCommand } from '@/ai/opencut-tools';
import { PLAYCANVAS_EDITOR_TOOLS, playcanvasEditorCommand } from '@/ai/playcanvas-editor-tools';
import { GDEVELOP_TOOLS, gdevelopCommand } from '@/ai/gdevelop-tools';
import { BLOCKBENCH_TOOLS, blockbenchCommand } from '@/ai/blockbench-tools';
import { SVGEDIT_TOOLS, svgeditCommand } from '@/ai/svgedit-tools';
import { TWINE_TOOLS, twineCommand } from '@/ai/twine-tools';
import { KETCHER_TOOLS, ketcherCommand } from '@/ai/ketcher-tools';
import { GEPHI_TOOLS, gephiCommand } from '@/ai/gephi-tools';
import { JUPYTERLITE_TOOLS, jupyterliteCommand } from '@/ai/jupyterlite-tools';
import { RAWGRAPHS_TOOLS, rawgraphsCommand } from '@/ai/rawgraphs-tools';
import { NOTES_TOOLS, notesCommand } from '@/ai/notes-tools';
import { FORMJS_TOOLS, formjsCommand } from '@/ai/formjs-tools';
import { PDFME_TOOLS, pdfmeCommand } from '@/ai/pdfme-tools';
import { MAPS_TOOLS, mapsCommand } from '@/ai/maps-tools';
import { P5_TOOLS, p5Command } from '@/ai/p5-tools';
import { GLSL_TOOLS, glslCommand } from '@/ai/glsl-tools';
import { GLYPHR_TOOLS, glyphrCommand } from '@/ai/glyphr-tools';
import { RECORDER_TOOLS, recorderCommand } from '@/ai/recorder-tools';
import { PISKEL_TOOLS, piskelCommand } from '@/ai/piskel-tools';
import { MERMAID_TOOLS, mermaidCommand } from '@/ai/mermaid-tools';
import { BITSY_TOOLS, bitsyCommand } from '@/ai/bitsy-tools';
import { AUDIOMASS_TOOLS, audiomassCommand } from '@/ai/audiomass-tools';
import { WEB_SYNTH_TOOLS, webSynthCommand } from '@/ai/web-synth-tools';
import { BEEPBOX_TOOLS, beepboxCommand } from '@/ai/beepbox-tools';
import { HEXTRIS_TOOLS, hextrisCommand } from '@/ai/hextris-tools';
import { PPTIST_TOOLS, pptistCommand } from '@/ai/pptist-tools';
import { WICK_TOOLS, wickCommand } from '@/ai/wick-editor-tools';
import { BENTOPDF_TOOLS, bentopdfCommand } from '@/ai/bentopdf-tools';
import { AM1_TOOLS, am1Command } from '@/ai/am-1-tools';
import { EVENTCALENDAR_TOOLS, eventcalendarCommand } from '@/ai/eventcalendar-tools';
import { INSTRUMENT_TOOLS, instrumentCommand } from '@/ai/instrument-tools';
import { samplerTools } from '@/ai/sampler-tools';
import { OPENMOSH_TOOLS, openmoshCommand } from '@/ai/openmosh-tools';
import { MINIPAINT_TOOLS, minipaintCommand } from '@/ai/minipaint-tools';
import {
  nativeAppType,
  isAudioMass,
  isWebSynth,
  isBeepBox,
  isHextris,
  isPPTist,
  isWickEditor,
  isBentoPDF,
  isAM1,
  isEventCalendar,
  isMiniPaint,
  isCardinal,
  isOpenMosh,
  samplerType,
} from './embedded-app';
import type { AppToolDefinition } from './embedded-app-tool-registry';

/** Trusted built-in adapters declare tools and affected files; frames cannot grant themselves tools. */
export function embeddedAppToolAdapter(
  crux: { kind?: string; meta?: Record<string, unknown> } | null,
) {
  if (crux?.kind === 'notes') return { tools: NOTES_TOOLS, prepare: notesCommand };
  if (nativeAppType(crux) === 'kan') return { tools: KAN_TOOLS, prepare: kanCommand };
  if (nativeAppType(crux) === 'formjs') return { tools: FORMJS_TOOLS, prepare: formjsCommand };
  if (nativeAppType(crux) === 'pdfme') return { tools: PDFME_TOOLS, prepare: pdfmeCommand };
  if (nativeAppType(crux) === 'maps') return { tools: MAPS_TOOLS, prepare: mapsCommand };
  if (nativeAppType(crux) === 'p5') return { tools: P5_TOOLS, prepare: p5Command };
  if (nativeAppType(crux) === 'glsl') return { tools: GLSL_TOOLS, prepare: glslCommand };
  if (nativeAppType(crux) === 'glyphr') return { tools: GLYPHR_TOOLS, prepare: glyphrCommand };
  if (nativeAppType(crux) === 'recorder')
    return { tools: RECORDER_TOOLS, prepare: recorderCommand };
  if (nativeAppType(crux) === 'opencut') return { tools: OPENCUT_TOOLS, prepare: opencutCommand };
  if (nativeAppType(crux) === 'playcanvas-editor')
    return { tools: PLAYCANVAS_EDITOR_TOOLS, prepare: playcanvasEditorCommand };
  if (nativeAppType(crux) === 'gdevelop')
    return { tools: GDEVELOP_TOOLS, prepare: gdevelopCommand };
  if (nativeAppType(crux) === 'blockbench')
    return { tools: BLOCKBENCH_TOOLS, prepare: blockbenchCommand };
  if (nativeAppType(crux) === 'svgedit') return { tools: SVGEDIT_TOOLS, prepare: svgeditCommand };
  if (nativeAppType(crux) === 'twine') return { tools: TWINE_TOOLS, prepare: twineCommand };
  if (nativeAppType(crux) === 'ketcher') return { tools: KETCHER_TOOLS, prepare: ketcherCommand };
  if (nativeAppType(crux) === 'gephi') return { tools: GEPHI_TOOLS, prepare: gephiCommand };
  if (nativeAppType(crux) === 'jupyterlite')
    return { tools: JUPYTERLITE_TOOLS, prepare: jupyterliteCommand };
  if (nativeAppType(crux) === 'rawgraphs')
    return { tools: RAWGRAPHS_TOOLS, prepare: rawgraphsCommand };
  if (nativeAppType(crux) === 'piskel') return { tools: PISKEL_TOOLS, prepare: piskelCommand };
  if (nativeAppType(crux) === 'mermaid') return { tools: MERMAID_TOOLS, prepare: mermaidCommand };
  if (nativeAppType(crux) === 'bitsy') return { tools: BITSY_TOOLS, prepare: bitsyCommand };
  if (isAudioMass(crux)) return { tools: AUDIOMASS_TOOLS, prepare: audiomassCommand };
  if (isWebSynth(crux)) return { tools: WEB_SYNTH_TOOLS, prepare: webSynthCommand };
  if (isBeepBox(crux)) return { tools: BEEPBOX_TOOLS, prepare: beepboxCommand };
  if (isHextris(crux)) return { tools: HEXTRIS_TOOLS, prepare: hextrisCommand };
  if (isPPTist(crux)) return { tools: PPTIST_TOOLS, prepare: pptistCommand };
  if (isWickEditor(crux)) return { tools: WICK_TOOLS, prepare: wickCommand };
  if (isBentoPDF(crux)) return { tools: BENTOPDF_TOOLS, prepare: bentopdfCommand };
  if (isAM1(crux)) return { tools: AM1_TOOLS, prepare: am1Command };
  if (isEventCalendar(crux)) return { tools: EVENTCALENDAR_TOOLS, prepare: eventcalendarCommand };
  if (isMiniPaint(crux)) return { tools: MINIPAINT_TOOLS, prepare: minipaintCommand };
  if (isOpenMosh(crux)) return { tools: OPENMOSH_TOOLS, prepare: openmoshCommand };
  const type = samplerType(crux);
  if (type) return samplerTools(type);
  if (!isCardinal(crux)) return null;
  return {
    tools: INSTRUMENT_TOOLS.map((tool) => ({
      ...tool,
      writes: tool.name === 'inspect_instrument' ? [] : ['music/instrument.json'],
    })) as AppToolDefinition[],
    prepare: instrumentCommand,
  };
}

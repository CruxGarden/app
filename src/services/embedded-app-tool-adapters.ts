import { PISKEL_TOOLS, piskelCommand } from '@/ai/piskel-tools';
import { MERMAID_TOOLS, mermaidCommand } from '@/ai/mermaid-tools';
import { BITSY_TOOLS, bitsyCommand } from '@/ai/bitsy-tools';
import { AUDIOMASS_TOOLS, audiomassCommand } from '@/ai/audiomass-tools';
import { INSTRUMENT_TOOLS, instrumentCommand } from '@/ai/instrument-tools';
import { samplerTools } from '@/ai/sampler-tools';
import { OPENMOSH_TOOLS, openmoshCommand } from '@/ai/openmosh-tools';
import { MINIPAINT_TOOLS, minipaintCommand } from '@/ai/minipaint-tools';
import {
  nativeAppType,
  isAudioMass,
  isMiniPaint,
  isCardinal,
  isOpenMosh,
  samplerType,
} from './embedded-app';
import type { AppToolDefinition } from './embedded-app-tool-registry';

/** Trusted built-in adapters declare tools and affected files; frames cannot grant themselves tools. */
export function embeddedAppToolAdapter(crux: { meta?: Record<string, unknown> } | null) {
  if (nativeAppType(crux) === 'piskel') return { tools: PISKEL_TOOLS, prepare: piskelCommand };
  if (nativeAppType(crux) === 'mermaid') return { tools: MERMAID_TOOLS, prepare: mermaidCommand };
  if (nativeAppType(crux) === 'bitsy') return { tools: BITSY_TOOLS, prepare: bitsyCommand };
  if (isAudioMass(crux)) return { tools: AUDIOMASS_TOOLS, prepare: audiomassCommand };
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

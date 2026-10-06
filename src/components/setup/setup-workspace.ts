import type { MosaicNode } from 'react-mosaic-component';
import type { PaneType } from '@/stores/uiStore';
import { NEEDS, type SetupNeed } from './setup-plan';

export type StartKind = 'guided' | 'template' | 'empty';
/** A different starting point gets its own activity, not the earlier interest's instructions. */
export function startingActivity(templateId: string, interest: SetupNeed | null): SetupNeed {
  if (NEEDS.find((choice) => choice.id === interest)?.templates.includes(templateId))
    return interest!;
  return NEEDS.find((choice) => choice.templates.includes(templateId))?.id ?? 'exploring';
}
export interface SetupWorkspace {
  need: SetupNeed | null;
  advancedMode: boolean;
  aiEnabled: boolean;
  width: number;
}
/** Fit the first activity to the actual workspace, without changing existing Crux layouts. */
export function setupWorkspaceLayout(options: SetupWorkspace): MosaicNode<PaneType> {
  const { need, advancedMode, aiEnabled, width } = options;
  const technical = advancedMode && (need === 'app' || need === 'website' || need === 'exploring');
  const side: PaneType[] = [];
  if (aiEnabled) side.push('collaboration');
  if (technical) side.push('artifacts');
  if (technical && need === 'app' && width >= 1200) side.push('store');
  if (!side.length) return 'workshop';
  // Stack supporting panels so the creation keeps a readable width.
  const stack = (panes: PaneType[]): MosaicNode<PaneType> =>
    panes.length === 1
      ? panes[0]!
      : {
          direction: 'column',
          first: panes[0]!,
          second: stack(panes.slice(1)),
          splitPercentage: panes[0] === 'collaboration' ? 60 : 50,
        };
  if (width < 900)
    return {
      direction: 'column',
      first: 'workshop',
      second: stack(side),
      splitPercentage: 68,
    };
  return {
    direction: 'row',
    first: stack(side),
    second: 'workshop',
    splitPercentage: Math.max(26, Math.min(38, Math.round((360 / width) * 100))),
  };
}

export const FIRST_ACTIVITY: Record<SetupNeed, { title: string; action: string; text: string }> = {
  website: {
    title: 'Your first website',
    action: 'Make it yours',
    text: 'Start with the page content in Workshop. Replace a heading and add a sentence about yourself, then preview your page.',
  },
  app: {
    title: 'Your first app',
    action: 'Try the example',
    text: 'Explore the example in Workshop, enter a sample request and inspect its saved result. The included example explains its data and sign-in choices.',
  },
  writing: {
    title: 'Your first notebook',
    action: 'Write a note',
    text: 'Open the folder tree in Workshop, choose a note and write a few sentences. Create another note when you have a second idea. Your changes save automatically.',
  },
  music: {
    title: 'Your first sounds',
    action: 'Play and change a sound',
    text: 'Use the instrument in Workshop to play a sound, then change one control and listen again. Start playback yourself when you are ready.',
  },
  art: {
    title: 'Your first visual',
    action: 'Make a mark',
    text: 'Use Workshop to add a shape, drawing or picture. Move it, change it and try undo. Your work stays on this computer until you choose to share it.',
  },
  game: {
    title: 'Your first game',
    action: 'Play, then make a change',
    text: 'Try the game in Workshop, then explore its editor or files and change one thing. Preview again to see what changed.',
  },
  exploring: {
    title: 'Find your way around',
    action: 'Explore Workshop',
    text: 'Workshop is where you make things. Try the starting project, then use Add Crux to explore other creative tools. Panels can be opened, resized and closed at any time.',
  },
};

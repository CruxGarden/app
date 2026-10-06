import { useEffect, useState } from 'react';
import type { MosaicNode } from 'react-mosaic-component';
import { firstCruxLayout, FIRST_ACTIVITY, startingActivity } from './setup-workspace';
import type { SetupNeed } from './setup-plan';
import { getMosaicLeaves, type PaneType } from '@/stores/uiStore';
import { paneLabel } from '@/lib/pane-labels';

const PURPOSE: Partial<Record<PaneType, string>> = {
  workshop: 'Make and try your work',
  collaboration: 'Talk ideas through and get help',
  artifacts: 'Browse and edit your files',
  store: 'Manage your app’s key-value data',
};

/** The same plan used on creation, drawn with the selected Mood's tokens. */
export default function WorkspacePreview({
  templateId,
  need,
  advancedMode,
  aiEnabled,
}: {
  templateId: string;
  need: SetupNeed | null;
  advancedMode: boolean;
  aiEnabled: boolean;
}) {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const layout = firstCruxLayout(templateId, { need, advancedMode, aiEnabled, ...size });
  return (
    <section
      aria-label="Your workspace"
      className="space-y-2"
      data-testid="setup-workspace-preview"
    >
      <h3 className="text-sm font-medium text-text">Your workspace</h3>
      <div className="h-36" aria-hidden>
        <Layout node={layout} />
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-muted">
        {getMosaicLeaves(layout).map((pane) => (
          <li key={pane}>
            <span className="font-medium text-text">{paneLabel(pane)}</span> · {PURPOSE[pane]}
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">
        {templateId === 'blank'
          ? 'Add your first file or open a tool when you arrive.'
          : FIRST_ACTIVITY[startingActivity(templateId, need)].action + ' when you arrive.'}{' '}
        Resize or change panels any time.
      </p>
    </section>
  );
}

function Layout({ node }: { node: MosaicNode<PaneType> }) {
  if (typeof node === 'string')
    return (
      <div
        data-preview-pane={node}
        className="h-full min-h-0 min-w-0 flex items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface p-1 text-xs text-text"
      >
        <span className="truncate">{paneLabel(node)}</span>
      </div>
    );
  return (
    <div
      className="flex h-full min-h-0 min-w-0 gap-1"
      style={{ flexDirection: node.direction === 'row' ? 'row' : 'column' }}
      data-preview-direction={node.direction}
    >
      <div className="min-w-0 min-h-0" style={{ flex: `${node.splitPercentage ?? 50} 1 0%` }}>
        <Layout node={node.first} />
      </div>
      <div
        className="min-w-0 min-h-0"
        style={{ flex: `${100 - (node.splitPercentage ?? 50)} 1 0%` }}
      >
        <Layout node={node.second} />
      </div>
    </div>
  );
}

import { useWorkspaceRegistry } from '@/stores/workspaceRegistry';
import { tendingPath } from '@/services/tending-actions';
import { Link } from 'react-router-dom';
import { Panel, buttonClass } from '@/components/ui';

/** Uses the same validated history as the workspace switcher; never opens background agents. */
export default function RecentWorkspaces() {
  const entries = useWorkspaceRegistry((s) => s.entries);
  const mru = useWorkspaceRegistry((s) => s.mru);
  const recent = mru.flatMap((id) => entries.filter((entry) => entry.id === id)).slice(0, 3);
  if (!recent.length) return null;
  return (
    <Panel padding="md" className="mb-4">
      <h2 className="text-sm font-medium text-text mb-1">Continue working</h2>
      <p className="text-xs text-text-muted mb-3">Your open workspaces, with the last one first.</p>
      <div className="flex flex-wrap gap-2">
        {recent.map((entry) => (
          <Link
            key={entry.id}
            className={buttonClass('secondary', 'sm')}
            to={tendingPath({ cruxId: entry.cruxId ?? entry.id, copyId: entry.id })}
          >
            {entry.title}
          </Link>
        ))}
      </div>
    </Panel>
  );
}

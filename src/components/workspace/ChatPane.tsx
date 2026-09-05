import { ChatPanel } from '@/components/chat';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/cn';

function DeleteConfirmations() {
  const pendingDeletes = useCruxStore((s) => s.pendingDeletes);
  const confirmDelete = useCruxStore((s) => s.confirmDelete);
  const dismissDelete = useCruxStore((s) => s.dismissDelete);

  if (pendingDeletes.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2">
      {pendingDeletes.map((d) => (
        <div
          key={d.artifactId}
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-error-muted border border-error/30"
        >
          <span className="text-xs font-mono text-text truncate">
            Delete <strong>{d.path}</strong>?
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => dismissDelete(d.artifactId)}
              className="px-2 py-0.5 text-xxs font-mono text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              Keep
            </button>
            <button
              onClick={() => confirmDelete(d.artifactId)}
              className={cn(
                'px-2 py-0.5 text-xxs font-mono rounded-[var(--radius-sm)]',
                'bg-error text-on-error hover-bright transition-colors motion-press cursor-pointer',
              )}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * An external agent (MCP, ADR 0013) asked to publish or unpublish. The person
 * answers here, in the app — never in the agent's terminal. The tool call is
 * blocked until one of these buttons is pressed.
 */
function AgentApprovals() {
  const pending = useUIStore((s) => s.pendingAgentApprovals);
  const resolve = useUIStore((s) => s.resolveAgentApproval);

  if (pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2" data-testid="agent-approvals">
      {pending.map((a) => (
        <div
          key={a.id}
          role="alert"
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-accent-muted border border-accent/30"
        >
          <span className="text-xs font-mono text-text truncate">
            <strong>{a.agent}</strong> wants to {a.action} this crux.
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => resolve(a.id, false)}
              className="px-2 py-0.5 text-xxs font-mono text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              Not now
            </button>
            <button
              onClick={() => resolve(a.id, true)}
              className={cn(
                'px-2 py-0.5 text-xxs font-mono rounded-[var(--radius-sm)]',
                'bg-primary-button text-primary-button-text border border-primary-button-border hover:bg-primary-button-hover transition-colors motion-press cursor-pointer',
              )}
            >
              {a.action === 'publish' ? 'Publish' : 'Unpublish'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChatPane() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <ChatPanel />
      </div>

      <DeleteConfirmations />
      <AgentApprovals />
    </div>
  );
}

import { ChatPanel } from '@/components/chat';
import { useCruxStore } from '@/stores/cruxStore';
import { useWorkspaceUIStore as useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/cn';
import { useState } from 'react';

/**
 * The whole request, readable: a single string argument (a command, a block
 * of code) is shown as itself; anything else as indented JSON. Nothing is
 * cut — the point is that the person can read all of it before allowing.
 */
function formatApprovalInput(input: Record<string, unknown>): string {
  const keys = Object.keys(input);
  if (keys.length === 1 && typeof input[keys[0]!] === 'string') {
    return `${keys[0]}:\n${input[keys[0]!] as string}`;
  }
  return JSON.stringify(input, null, 2);
}

function DeleteConfirmations() {
  const pendingDeletes = useCruxStore((s) => s.pendingDeletes);
  const confirmDelete = useCruxStore((s) => s.confirmDelete);
  const dismissDelete = useCruxStore((s) => s.dismissDelete);

  if (pendingDeletes.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2">
      {pendingDeletes.map((d) => (
        <div
          key={d.id}
          data-tending-request={d.id}
          tabIndex={-1}
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
  const [reviewing, setReviewing] = useState<string | null>(null);

  if (pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2" data-testid="agent-approvals">
      {pending.map((a) => (
        <div
          key={a.id}
          data-tending-request={a.id}
          tabIndex={-1}
          role="alert"
          className="flex flex-col gap-1.5 px-3 py-2 rounded-[var(--radius-sm)] bg-accent-muted border border-accent/30"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-text truncate" title={a.detail}>
              {a.action === 'tool' ? (
                <>
                  <strong>{a.agent}</strong> wants to run <strong>{a.tool}</strong>
                  {a.detail ? <span className="text-text-muted">: {a.detail}</span> : null}
                </>
              ) : (
                <>
                  <strong>{a.agent}</strong> wants to {a.action} this crux.
                </>
              )}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {a.action === 'tool' && a.input && Object.keys(a.input).length > 0 && (
                <button
                  onClick={() => setReviewing((r) => (r === a.id ? null : a.id))}
                  aria-expanded={reviewing === a.id}
                  aria-label={
                    reviewing === a.id ? 'Hide the full request' : 'Review the full request'
                  }
                  className="px-2 py-0.5 text-xxs font-mono text-text-muted hover:text-text transition-colors cursor-pointer"
                >
                  {reviewing === a.id ? 'Hide' : 'Review'}
                </button>
              )}
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
                {a.action === 'publish'
                  ? 'Publish'
                  : a.action === 'unpublish'
                    ? 'Unpublish'
                    : 'Allow'}
              </button>
            </div>
          </div>
          {reviewing === a.id && a.input && (
            <pre
              data-testid="agent-approval-review"
              className="max-h-64 overflow-auto px-2 py-1.5 text-2xs font-mono leading-relaxed whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-code-block border border-code-block-border text-text"
            >
              {formatApprovalInput(a.input)}
            </pre>
          )}
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

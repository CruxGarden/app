import { linkClass } from '@/components/ui/button-class';
import { SANDBOX_NOTE, trustRows, type ToolSummary } from './tool-trust';

/** Publisher, version, size, upstream credit, licence, sandbox and permissions. */
export default function ToolTrustDetails({
  summary,
  compact = false,
}: {
  summary: ToolSummary;
  /** Folded under "Details" on a card; open on the Tool's own page. */
  compact?: boolean;
}) {
  const list = (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"
      data-testid="tool-trust-details"
    >
      {trustRows(summary).map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-text-muted">{row.label}</dt>
          <dd className="text-text min-w-0 break-words">
            {row.href ? (
              <a href={row.href} target="_blank" rel="noopener noreferrer" className={linkClass()}>
                {row.value}
              </a>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
      <dd className="col-span-2 text-text-muted">{SANDBOX_NOTE}</dd>
    </dl>
  );
  if (!compact) return list;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-text-muted hover:text-text transition-colors">
        Details
      </summary>
      <div className="mt-2">{list}</div>
    </details>
  );
}

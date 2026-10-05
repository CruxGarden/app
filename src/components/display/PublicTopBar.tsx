import { APP_NAME } from '@/lib/constants';
import { useState } from 'react';
import { iconButtonClass } from '@/components/ui/button-class';
import ReportDialog from '@/components/public/ReportDialog';

interface PublicTopBarProps {
  title?: string;
  username: string;
  hasMetadata?: boolean;
  metadataOpen?: boolean;
  onToggleMetadata?: () => void;
  /** The published creation this bar is over; gives visitors a Report action. */
  reportCruxId?: string;
}

export default function PublicTopBar({
  title,
  username,
  hasMetadata,
  metadataOpen,
  onToggleMetadata,
  reportCruxId,
}: PublicTopBarProps) {
  const [reporting, setReporting] = useState(false);
  const link =
    'text-2xs font-mono px-2 py-1 rounded-[var(--radius-sm)] text-public-top-bar-link hover:text-public-top-bar-link-hover hover:bg-action-button-hover transition-colors';
  return (
    <header className="relative z-20 flex items-center justify-between h-8 px-3 border-b border-public-top-bar-border bg-public-top-bar shrink-0">
      <div className="flex items-center gap-1.5 min-w-0 text-2xs font-mono">
        <a
          href="https://crux.garden"
          className="shrink-0 text-public-top-bar-link hover:text-public-top-bar-link-hover hover:underline"
        >
          {APP_NAME}
        </a>
        <span className="text-public-top-bar-text-muted/(--tint-muted)">/</span>
        <a
          href={`/${username}`}
          className="shrink-0 text-public-top-bar-link hover:text-public-top-bar-link-hover hover:underline"
        >
          {username}
        </a>
        {title && (
          <>
            <span className="text-public-top-bar-text-muted/(--tint-muted)">/</span>
            <span className="text-public-top-bar-text truncate">{title}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {reportCruxId && (
          <button
            type="button"
            onClick={() => setReporting(true)}
            aria-haspopup="dialog"
            className={`${link} cursor-pointer`}
          >
            Report
          </button>
        )}
        <a href="/explore" className={link}>
          Explore
        </a>
        {hasMetadata && onToggleMetadata && (
          <button
            onClick={onToggleMetadata}
            aria-label="Details"
            title="Details"
            className={iconButtonClass('sm', !!metadataOpen)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </button>
        )}
      </div>
      {reportCruxId && (
        <ReportDialog
          open={reporting}
          cruxId={reportCruxId}
          title={title}
          // Modal returns focus to the control that opened it.
          onClose={() => setReporting(false)}
        />
      )}
    </header>
  );
}

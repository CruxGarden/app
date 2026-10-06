import { Capability, can } from '@/lib/platform';
import { cn } from '@/lib/cn';
import { Link } from 'react-router-dom';
import AreaNavigation from '@/components/layout/AreaNavigation';
import { isPublicSite } from '@/lib/site';
import { useState } from 'react';
import { iconButtonClass } from '@/components/ui/button-class';
import ReportDialog from '@/components/public/ReportDialog';

interface PublicTopBarProps {
  /** A visitor preview inside the Garden is not navigation into Explore. */
  preview?: boolean;
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
  preview = false,
}: PublicTopBarProps) {
  const [reporting, setReporting] = useState(false);
  const link =
    'text-2xs font-mono px-2 py-1 rounded-[var(--radius-sm)] text-public-top-bar-link hover:text-public-top-bar-link-hover hover:bg-action-button-hover transition-colors';
  return (
    <header
      className={cn(
        'relative z-20 flex items-center flex-wrap gap-y-1 justify-between min-h-8 py-1 px-3 border-b border-public-top-bar-border bg-public-top-bar shrink-0',
        !preview && can(Capability.DesktopChrome) && 'pl-24',
      )}
    >
      <div className="flex flex-wrap flex-1 basis-60 items-center gap-1.5 min-w-0 text-2xs font-mono">
        {!preview && <AreaNavigation area="explore" />}
        <Link
          to="/explore"
          className="shrink-0 text-public-top-bar-link hover:text-public-top-bar-link-hover hover:underline"
        >
          Explore Home
        </Link>
        <span className="text-public-top-bar-text-muted/(--tint-muted)">/</span>
        <Link
          to={`/${username}`}
          className="shrink-0 text-public-top-bar-link hover:text-public-top-bar-link-hover hover:underline"
        >
          {username}
        </Link>
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
        {isPublicSite() && (
          <Link to="/#download" className={link}>
            Get Crux Garden
          </Link>
        )}
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

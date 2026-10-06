import type { MouseEvent } from 'react';
import { linkClass } from '@/components/ui/button-class';
import { cn } from '@/lib/cn';
import { Capability, can } from '@/lib/platform';
import { gardenOrigin, openGardenPage } from '@/lib/public-url';
import { LEGAL_PAGES, type LegalPath } from '@/lib/site';

/**
 * A link to one of the website's legal pages. On the website it is an ordinary
 * link; in the desktop app the page lives at crux.garden, so it opens in the
 * system browser (the shell never navigates away from the app).
 */
export function LegalLink({
  to,
  children,
  className,
}: {
  to: LegalPath;
  children: React.ReactNode;
  className?: string;
}) {
  const desktop = can(Capability.DesktopChrome);
  const open = (event: MouseEvent) => {
    if (!desktop) return;
    event.preventDefault();
    void openGardenPage(to);
  };
  return (
    <a
      href={desktop ? `${gardenOrigin()}${to}` : to}
      onClick={open}
      className={className ?? linkClass()}
      {...(desktop ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

/** Terms · Privacy · Contact, as a quiet row. The page decides where it sits. */
export default function LegalLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs', className)}
    >
      {LEGAL_PAGES.map((page) => (
        <LegalLink
          key={page.path}
          to={page.path}
          className={linkClass('text-text-muted hover:text-text')}
        >
          {page.label}
        </LegalLink>
      ))}
    </nav>
  );
}

/** The foot of a public page: the legal row, centred under the content. */
export function PublicFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('relative z-10 w-full px-4 py-6 flex justify-center', className)}>
      <LegalLinks className="justify-center rounded-[var(--radius-md)] bg-panel border border-panel-border px-4 py-2" />
    </footer>
  );
}

/** "By … you agree to the Terms and Privacy." — beside a purchase or a sign-in. */
export function LegalAgreement({ action, className }: { action: string; className?: string }) {
  return (
    <p className={cn('text-xxs text-text-muted', className)}>
      By {action} you agree to the <LegalLink to="/terms">Terms</LegalLink> and{' '}
      <LegalLink to="/privacy">Privacy</LegalLink> pages.
    </p>
  );
}

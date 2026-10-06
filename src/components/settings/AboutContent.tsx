import { useEffect, useState } from 'react';
import { Button, linkClass } from '@/components/ui';
import type { DesktopInfo } from '@/lib/platform';
import { getDesktopInfo, openWeb } from '@/services/desktop';
import { GITHUB_APP_URL, LICENSE_URL, WEBSITE_URL } from '@/lib/site';
import { openShellDialog } from '@/stores/shellDialogs';

const LINKS = [
  { label: 'Website', url: WEBSITE_URL },
  { label: 'Source', url: GITHUB_APP_URL },
  { label: 'MIT licence', url: LICENSE_URL },
];

/** What this app is and where it comes from — shown in Settings and from the menu's About. */
export default function AboutContent() {
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  useEffect(() => {
    void getDesktopInfo().then(setInfo);
  }, []);
  return (
    <div data-testid="about" className="flex flex-col gap-3 text-xs">
      <div>
        <div className="text-sm text-text">Crux Garden</div>
        <div className="font-mono text-text-muted" data-testid="about-version">
          {info
            ? `Version ${info.version} · ${info.platform}-${info.arch}${info.packaged ? '' : ' · dev'}`
            : ' '}
        </div>
      </div>
      <p className="text-text-muted">
        A local-first creative workspace. Open source, built on the open-source work of many others.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {LINKS.map(({ label, url }) => (
          <button
            key={label}
            type="button"
            className={linkClass()}
            onClick={() => void openWeb(url)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => openShellDialog('notices')}>
          Open-source notices
        </Button>
        <Button size="sm" variant="secondary" onClick={() => openShellDialog('shortcuts')}>
          Keyboard shortcuts
        </Button>
        <Button size="sm" variant="secondary" onClick={() => openShellDialog('report-problem')}>
          Report a problem
        </Button>
      </div>
    </div>
  );
}

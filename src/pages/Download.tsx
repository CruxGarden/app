import { useEffect, useState } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { buttonClass, linkClass } from '@/components/ui/button-class';

const releases = 'https://github.com/CruxGarden/app/releases';
const choices = [
  {
    id: 'mac-arm',
    label: 'Mac · Apple silicon',
    match: /-arm64\.dmg$/i,
    help: 'For Macs with an Apple M-series chip. Open the DMG and drag Crux Garden into Applications.',
  },
  {
    id: 'mac-intel',
    label: 'Mac · Intel',
    match: /-x64\.dmg$/i,
    help: 'For Intel Macs. Open the DMG and drag Crux Garden into Applications.',
  },
  {
    id: 'windows',
    label: 'Windows',
    match: /-win-x64\.exe$/i,
    help: 'Open the installer and follow the installation steps.',
  },
  {
    id: 'linux',
    label: 'Linux · AppImage',
    match: /-linux-x64\.AppImage$/i,
    help: 'Allow this file to run as a program in its file properties, then open it.',
  },
];
type Installer = { name: string; browser_download_url: string };

export default function Download() {
  const [assets, setAssets] = useState<Installer[]>([]);
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 12_000);
    let active = true;
    setStatus('loading');
    void fetch('https://api.github.com/repos/CruxGarden/app/releases/latest', {
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Release unavailable');
        const release = await response.json();
        if (release.draft || release.prerelease || !Array.isArray(release.assets))
          throw new Error('Release unavailable');
        const installers = release.assets.filter(
          (asset: Installer) =>
            typeof asset.name === 'string' &&
            typeof asset.browser_download_url === 'string' &&
            asset.browser_download_url.startsWith(`${releases}/download/`) &&
            choices.some((choice) => choice.match.test(asset.name)),
        );
        if (!installers.length) throw new Error('No installers');
        if (active) {
          setAssets(installers);
          setVersion(typeof release.tag_name === 'string' ? release.tag_name : '');
          setStatus('ready');
        }
      })
      .catch(() => {
        if (active) setStatus('unavailable');
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      abort.abort();
    };
  }, [attempt]);
  const os = /Windows/i.test(navigator.userAgent)
    ? 'windows'
    : /Macintosh|Mac OS X/i.test(navigator.userAgent)
      ? 'mac'
      : 'linux';
  const ordered = [...choices].sort(
    (a, b) => Number(b.id.startsWith(os)) - Number(a.id.startsWith(os)),
  );
  return (
    <div className="min-h-screen">
      <PageHeader title="Download" />
      <main className="relative z-10 max-w-4xl mx-auto my-8 p-8 bg-panel text-panel-text border border-panel-border rounded-[var(--radius)] shadow-panel space-y-8">
        <div className="space-y-3">
          <p className="text-sm text-accent">Crux Garden for desktop {version}</p>
          <h1 className="text-3xl font-display text-text">Your first website starts here</h1>
          <p className="text-text-muted">
            Make a home page, portfolio or any website. Edit it on your computer, then publish to
            crux.garden when you’re ready.
          </p>
          <p className="text-sm text-text-muted">
            You can personalize the home page without AI or an account. Sign in for publishing and
            your plan’s included AI. No personal AI key is needed for included access.
          </p>
        </div>
        {status === 'loading' && <p role="status">Finding the latest installers…</p>}
        {status === 'unavailable' && (
          <div role="status" className="space-y-3">
            <p>
              We couldn’t find an available public installer. Check releases, or try again in a
              moment.
            </p>
            <button
              className={buttonClass('secondary', 'sm')}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>{' '}
            <a className={linkClass()} href={releases}>
              Check releases
            </a>
          </div>
        )}
        {status === 'ready' && (
          <section aria-label="Choose your computer" className="grid grid-cols-2 gap-4">
            {ordered.map((choice) => {
              const asset = assets.find((asset) => choice.match.test(asset.name));
              return (
                <div
                  key={choice.id}
                  className="p-5 border border-border rounded-[var(--radius-sm)] space-y-3"
                >
                  <h2 className="text-lg font-medium text-text">{choice.label}</h2>
                  <p className="text-sm text-text-muted">{choice.help}</p>
                  {asset ? (
                    <a href={asset.browser_download_url} className={buttonClass('primary', 'sm')}>
                      Download for {choice.label}
                    </a>
                  ) : (
                    <p className="text-sm text-text-muted">
                      Installer not available in this release.
                    </p>
                  )}
                </div>
              );
            })}
          </section>
        )}
        <p className="text-sm text-text-muted">
          Not sure which Mac? Apple menu → About This Mac shows an Apple chip or an Intel processor.
        </p>
        <section className="space-y-3" aria-label="Your first website">
          <h2 className="text-xl font-display text-text">From opening the app to your own link</h2>
          <ol className="list-decimal pl-5 space-y-2 text-text-muted">
            <li>
              Open Crux Garden and choose <strong className="text-text">Make my home page</strong>{' '}
              during setup.
            </li>
            <li>Add your name, introduction and photo. Your edits save automatically.</li>
            <li>Preview your page, then open Share and review what visitors will see.</li>
            <li>
              Publish to crux.garden and copy your link. A local test Garden is available if you
              want to rehearse first.
            </li>
          </ol>
          <p className="text-sm text-text-muted">
            Have another idea? Add a Crux and describe the website you want, or choose a starting
            point. Your projects stay editable after publishing.
          </p>
        </section>
        <a className={linkClass()} href="/plans">
          See plans and included AI
        </a>
      </main>
    </div>
  );
}

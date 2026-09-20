import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { myGardens, acceptInvitation, type MyGarden } from '@/api/gardens';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Home → Gardens (GARDEN-MEMBERS-PLAN): the gardens I own or belong to, and
 * the invitations waiting on me — read from the API, which reads the
 * gardens' own Stores. Accepting calls the garden's accept function as me.
 */
export default function Gardens() {
  const authenticated = useAuthStore((s) => !!s.account);
  const author = useAppStore((s) => s.author);
  const navigate = useNavigate();
  const [gardens, setGardens] = useState<MyGarden[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    myGardens()
      .then(setGardens)
      .catch(() => setGardens([]));
  useEffect(() => {
    if (!authenticated) return;
    void load();
  }, [authenticated]);

  if (!authenticated || !gardens || gardens.length === 0) return null;

  const open = (g: MyGarden) => navigate(`/@${g.authorUsername}/${g.slug}`);
  const accept = async (g: MyGarden) => {
    setBusy(g.cruxId);
    setError(null);
    try {
      await acceptInvitation(g.cruxId, {
        username: author?.username ?? '',
        displayName: author?.displayName ?? '',
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className="bg-panel border border-border rounded-[var(--radius)] p-4 mb-4"
      data-testid="gardens-section"
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-sm font-medium text-text">Gardens</h2>
        <span className="text-xxs text-text-muted">
          Places you belong to — each a crux with people in it.
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {gardens.map((g) => {
          const m = g.membership;
          const invited = m?.status === 'invited';
          return (
            <li
              key={g.cruxId}
              className={cn('flex items-center gap-3 text-xs', invited && 'text-text-muted')}
              data-testid={`garden-${g.cruxId}`}
            >
              <button
                type="button"
                className="text-text hover:text-accent text-left cursor-pointer"
                onClick={() => open(g)}
              >
                {g.title || 'A garden'}
              </button>
              <span className="text-2xs text-text-muted">
                @{g.authorUsername} · {m?.role ?? 'member'}
                {invited ? ' · invited you' : ''}
              </span>
              <span className="flex-1" />
              {invited && (
                <Button size="sm" disabled={busy !== null} onClick={() => void accept(g)}>
                  Accept
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-xxs text-error mt-2">{error}</p>}
    </section>
  );
}

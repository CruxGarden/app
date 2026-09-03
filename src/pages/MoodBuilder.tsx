import { useEffect, Suspense, lazy } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { APP_NAME } from '@/lib/constants';
import { Button } from '@/components/ui';

const MoodEditor = lazy(() => import('@/components/mood/Mood'));

type Tab = 'moods' | 'palette' | 'theme' | 'resonance' | 'background' | 'persona';
const TABS: Tab[] = ['moods', 'palette', 'theme', 'resonance', 'background', 'persona'];

/**
 * The Mood Builder: presets, the full theme token editor, background and
 * persona — a page, not a modal, because theming is something you sit with.
 * Everything applies live to the app around it.
 */
export default function MoodBuilder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requested = params.get('tab') as Tab | null;
  const initialTab = requested && TABS.includes(requested) ? requested : 'theme';

  useEffect(() => {
    document.title = `Mood Builder — ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto h-full min-h-0 flex flex-col">
      <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="font-display text-lg font-medium text-text">Mood Builder</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Shape how Crux Garden feels: palette, every theme token, background, and your AI
            persona.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          Done
        </Button>
      </div>

      <div className="bg-panel border border-border rounded-[var(--radius)] p-4 sm:p-5 flex-1 min-h-0 flex flex-col">
        <Suspense fallback={null}>
          <MoodEditor initialTab={initialTab} />
        </Suspense>
      </div>
    </div>
  );
}

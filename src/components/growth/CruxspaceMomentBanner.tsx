import { useCruxspaceMoment } from '@/hooks/useCruxspaceMoment';
import { buttonClass } from '@/components/ui/button-class';
import { setCruxspaceMoment } from '@/services/cruxspace-moment';

/** Shown in a member while a person walks through its Cruxspace's history. */
export default function CruxspaceMomentBanner() {
  const { moment, member, existed } = useCruxspaceMoment();
  if (!moment || !member) return null;
  return (
    <div
      role="status"
      aria-label="Walkthrough"
      className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs bg-accent-muted border-b border-border"
    >
      <span>
        Walking through <strong>{moment.spaceName}</strong> · step {moment.step} of {moment.steps}:{' '}
        {moment.title}
        {existed ? '' : ' · this Crux did not exist yet at this moment'}
      </span>
      <button
        className={buttonClass('secondary', 'xs', 'min-h-6 py-0.5 px-2')}
        onClick={() => setCruxspaceMoment(null)}
      >
        Back to now
      </button>
    </div>
  );
}

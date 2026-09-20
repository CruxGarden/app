import { useKeeperStore } from '@/stores/keeperStore';
import { useUIStore } from '@/stores/uiStore';
import { ConsoleAvatar } from './Console';
import { cn } from '@/lib/cn';

/**
 * The hands, visible while the console is closed (GARDENS-ALL-THE-WAY-OUT:
 * "the person must see the hands move … it's the conversation menu"): when
 * the Keeper is working — showing, planting, running a turn — a chip in the
 * top bar says what it is doing, with Stop. Clicking it opens the console.
 */
export default function KeeperActivity() {
  const streaming = useKeeperStore((s) => s.streaming);
  const working = useKeeperStore((s) => s.working);
  const stop = useKeeperStore((s) => s.stop);
  const consoleOpen = useUIStore((s) => s.consoleOpen);
  if (!streaming || consoleOpen) return null;
  return (
    <div
      className={cn(
        'flex items-center gap-2 h-7 pl-1 pr-1.5 rounded-full',
        'bg-mood-bar border border-mood-bar-border text-xxs text-text',
      )}
      data-testid="keeper-activity"
      role="status"
    >
      <button
        type="button"
        onClick={() => useUIStore.getState().setConsoleOpen(true)}
        className="flex items-center gap-1.5 cursor-pointer"
        aria-label="Open the console"
      >
        <ConsoleAvatar className="w-5 h-5 rounded-full overflow-hidden" />
        <span className="font-mono truncate max-w-[16rem]">{working ?? 'Working…'}</span>
      </button>
      <button
        type="button"
        onClick={stop}
        className="px-1.5 h-5 rounded-full border border-border text-xxs hover:border-accent hover:text-accent cursor-pointer"
      >
        Stop
      </button>
    </div>
  );
}

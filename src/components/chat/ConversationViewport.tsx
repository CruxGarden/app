import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { buttonClass } from '@/components/ui/button-class';
import { cn } from '@/lib/cn';

/** Follow new replies only while the reader is at the end of the conversation. */
export default function ConversationViewport({
  children,
  label,
  resetKey,
  sentCount,
  className,
}: {
  children: ReactNode;
  label: string;
  resetKey?: string | null;
  sentCount: number;
  className?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const lastScrollTop = useRef(0);
  const [showLatest, setShowLatest] = useState(false);
  const sync = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    if (following.current) {
      element.scrollTop = element.scrollHeight;
      lastScrollTop.current = element.scrollTop;
    }
    const atEnd = element.scrollHeight - element.clientHeight - element.scrollTop <= 48;
    setShowLatest(!atEnd);
  }, []);
  const latest = useCallback(() => {
    following.current = true;
    sync();
  }, [sync]);
  // A different conversation or the reader's own new message starts at the end.
  useLayoutEffect(latest, [resetKey, sentCount, latest]);
  // React updates, rendered Markdown/images and pane resizing all change height.
  useLayoutEffect(sync);
  useEffect(() => {
    const observer = new ResizeObserver(sync);
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [sync]);
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        ref={viewport}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="flex-1 min-h-0 overflow-y-auto [overflow-anchor:none]"
        onWheel={(event) => {
          if (event.deltaY < 0) following.current = false;
        }}
        onKeyDown={(event) => {
          if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) following.current = false;
        }}
        onScroll={() => {
          const element = viewport.current;
          if (!element) return;
          const delta = element.scrollTop - lastScrollTop.current;
          const atEnd = element.scrollHeight - element.clientHeight - element.scrollTop <= 48;
          // Ignore our own queued scroll event. Only moving toward the end
          // resumes following after an upward gesture; a token may arrive
          // between that gesture and the browser applying its scroll.
          if (delta < 0) following.current = false;
          else if (delta > 0 && atEnd) following.current = true;
          lastScrollTop.current = element.scrollTop;
          setShowLatest(!atEnd);
        }}
      >
        <div ref={content} className={cn('px-4 py-4', className)}>
          {children}
        </div>
      </div>
      {showLatest && (
        <div className="shrink-0 flex justify-center py-2">
          <button
            type="button"
            onClick={() => {
              latest();
              viewport.current?.focus({ preventScroll: true });
            }}
            className={buttonClass('secondary', 'xs')}
          >
            Latest reply
          </button>
        </div>
      )}
    </div>
  );
}

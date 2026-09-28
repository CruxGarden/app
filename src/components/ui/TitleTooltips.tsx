import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { plainTitles } from '@/lib/platform';

interface Tip {
  text: string;
  x: number;
  y: number;
  above: boolean;
}

const DELAY_MS = 400;
/** After one tooltip, the next arrives at once (moving along a toolbar). */
const WARM_MS = 600;

/**
 * Every `title=` in the app shows as the app's own tooltip instead of the
 * operating system's (UX pass, 2026-09-27: ~150 of them were plain grey OS
 * boxes that arrived a second late). While an element is hovered its `title`
 * moves to `data-tip-title` — which is what keeps the native one away — and
 * comes back when the pointer leaves. Monaco and anything marked
 * `data-no-tip` keep their own. Mounted once, at the app's root.
 */
export default function TitleTooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const shown = useRef(false);
  useEffect(() => {
    if (plainTitles()) return;
    let target: HTMLElement | null = null;
    let timer = 0;
    let warmUntil = 0;
    const hideTip = () => {
      window.clearTimeout(timer);
      if (shown.current) warmUntil = Date.now() + WARM_MS;
      shown.current = false;
      setTip(null);
    };
    const release = () => {
      hideTip();
      if (target) {
        const title = target.dataset.tipTitle;
        if (title !== undefined && !target.hasAttribute('title'))
          target.setAttribute('title', title);
        delete target.dataset.tipTitle;
        target.removeAttribute('aria-describedby');
        if (target.dataset.tipLabel !== undefined) {
          target.removeAttribute('aria-label');
          delete target.dataset.tipLabel;
        }
      }
      target = null;
    };
    const place = (el: HTMLElement, text: string) => {
      const r = el.getBoundingClientRect();
      const above = r.bottom + 44 > window.innerHeight;
      const x = Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150);
      shown.current = true;
      el.setAttribute('aria-describedby', 'app-title-tip');
      setTip({ text, x, y: above ? r.top - 6 : r.bottom + 6, above });
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[title]');
      if (!el || el === target) return;
      if (el.closest('.monaco-editor, [data-no-tip]')) return;
      const text = el.getAttribute('title')?.trim();
      if (!text) return;
      release();
      target = el;
      el.dataset.tipTitle = el.getAttribute('title') ?? '';
      el.removeAttribute('title');
      // A control named only by its title keeps that name while it is hovered.
      if (
        !el.hasAttribute('aria-label') &&
        !el.hasAttribute('aria-labelledby') &&
        !el.textContent?.trim()
      ) {
        el.setAttribute('aria-label', text);
        el.dataset.tipLabel = '';
      }
      const delay = Date.now() < warmUntil ? 0 : DELAY_MS;
      timer = window.setTimeout(() => {
        if (target === el && el.isConnected) place(el, text);
      }, delay);
    };
    const out = (e: PointerEvent) => {
      if (!target) return;
      const to = e.relatedTarget as Node | null;
      if (to && target.contains(to)) return;
      release();
    };
    // A press, a key or a scroll puts the tooltip away; the title stays off
    // until the pointer leaves, so the OS one does not appear in its place.
    const dismiss = () => hideTip();
    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerout', out, true);
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', dismiss, true);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerout', out, true);
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', dismiss, true);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('blur', release);
      release();
    };
  }, []);
  if (!tip) return null;
  return createPortal(
    <div
      id="app-title-tip"
      role="tooltip"
      className="fixed z-[200] pointer-events-none max-w-[300px] px-2.5 py-1.5 rounded-tooltip bg-tooltip border border-tooltip-border shadow-tooltip text-xs text-tooltip-text motion-enter-dropdown"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(-50%, ${tip.above ? '-100%' : '0'})`,
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}

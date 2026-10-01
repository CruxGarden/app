import { useEffect, useRef, type RefObject } from 'react';

interface OpenModal {
  element: HTMLElement;
  layer: number;
}
const modals: OpenModal[] = [];
const isolated = new Map<HTMLElement, boolean>();
const topModal = () => [...modals].sort((a, b) => a.layer - b.layer).at(-1);

/** Isolate portal siblings, preserving any inert state owned by the caller. */
function isolateBackground() {
  for (const [element, wasInert] of isolated) element.inert = wasInert;
  isolated.clear();
  let branch = topModal()?.element;
  while (branch?.parentElement && branch.parentElement !== document.body)
    branch = branch.parentElement;
  if (!branch) return;
  for (const sibling of document.body.children) {
    if (sibling !== branch && sibling instanceof HTMLElement) {
      isolated.set(sibling, sibling.inert);
      sibling.inert = true;
    }
  }
}

function tabStops(element: HTMLElement) {
  return [
    ...element.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]',
    ),
  ].filter(
    (item) =>
      item.tabIndex >= 0 &&
      !item.matches(':disabled') &&
      !item.closest('[inert]') &&
      item.getClientRects().length > 0 &&
      getComputedStyle(item).visibility !== 'hidden',
  );
}

/** One owner for focus and background isolation across stacked app dialogs. */
export function useModalFocus(ref: RefObject<HTMLElement | null>, open: boolean, layer: number) {
  const opener = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opener.current = document.activeElement;
  wasOpen.current = open;

  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const entry = { element, layer };
    const back = opener.current;
    modals.push(entry);
    isolateBackground();
    const focusInside = () => {
      if (topModal() !== entry || element.contains(document.activeElement)) return;
      const stops = tabStops(element);
      (stops.find((item) => item.hasAttribute('data-autofocus')) ?? stops[0] ?? element).focus();
    };
    focusInside();
    const key = (event: KeyboardEvent) => {
      if (topModal() !== entry || event.key !== 'Tab') return;
      const stops = tabStops(element);
      const first = stops[0];
      const last = stops.at(-1);
      const active = document.activeElement;
      if (
        !first ||
        !element.contains(active) ||
        active === element ||
        (event.shiftKey ? active === first : active === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? (last ?? element) : (first ?? element)).focus();
      }
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('focusin', focusInside);
    // New portal siblings (including another dialog) must follow the same isolation.
    const observer = new MutationObserver(isolateBackground);
    observer.observe(document.body, { childList: true });
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('focusin', focusInside);
      const ownedFocus =
        element.contains(document.activeElement) || document.activeElement === document.body;
      modals.splice(modals.indexOf(entry), 1);
      isolateBackground();
      if (ownedFocus && back instanceof HTMLElement && back.isConnected && !back.closest('[inert]'))
        back.focus();
    };
  }, [ref, open, layer]);
}

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { PaneType } from '@/stores/uiStore';

// ── Types ────────────────────────────────────────────────

interface DragState {
  dragSource: PaneType | null;
  dropTarget: PaneType | null;
}

interface DragContextValue extends DragState {
  startDrag: (pane: PaneType) => void;
  setDropTarget: (pane: PaneType | null) => void;
  endDrag: () => void;
}

// ── Context ──────────────────────────────────────────────

const DragCtx = createContext<DragContextValue | null>(null);

interface DragProviderProps {
  onReorder: (source: PaneType, target: PaneType) => void;
  children: ReactNode;
}

export function DragProvider({ onReorder, children }: DragProviderProps) {
  const [state, setState] = useState<DragState>({
    dragSource: null,
    dropTarget: null,
  });

  const startDrag = useCallback((pane: PaneType) => {
    setState({ dragSource: pane, dropTarget: null });
  }, []);

  const setDropTarget = useCallback((pane: PaneType | null) => {
    setState((prev) => ({ ...prev, dropTarget: pane }));
  }, []);

  const endDrag = useCallback(() => {
    setState((prev) => {
      if (prev.dragSource && prev.dropTarget && prev.dragSource !== prev.dropTarget) {
        onReorder(prev.dragSource, prev.dropTarget);
      }
      return { dragSource: null, dropTarget: null };
    });
  }, [onReorder]);

  return (
    <DragCtx.Provider value={{ ...state, startDrag, setDropTarget, endDrag }}>
      {children}
    </DragCtx.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────

const noop = () => {};
const FALLBACK: DragContextValue = {
  dragSource: null,
  dropTarget: null,
  startDrag: noop,
  setDropTarget: noop,
  endDrag: noop,
};

export function usePaneDrag() {
  return useContext(DragCtx) ?? FALLBACK;
}

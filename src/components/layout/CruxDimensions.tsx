import DimensionConnections from './DimensionConnections';
import { useConnectionNavigation } from './useConnectionNavigation';
import { useNavigationView } from './useNavigationView';

/** Everyday graph movement stays beside the work; the Navigator is optional. */
export default function CruxDimensions() {
  const view = useNavigationView();
  const { open, error } = useConnectionNavigation(view);
  if (!view.cruxId || !view.gardenId) return null;
  return (
    <section
      aria-label="Crux connections"
      className="shrink-0 max-h-36 overflow-y-auto border-t border-border bg-bg/70 px-3 py-1"
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          {error && (
            <p role="alert" className="text-xs text-error py-1">
              {error}
            </p>
          )}
          <DimensionConnections
            key={`${view.cruxId}:${view.graph.revision}`}
            graph={view.graph}
            id={view.cruxId}
            depth={1}
            open={open}
            compact
          />
        </div>
        <button
          aria-label="Refresh connections"
          title="Refresh connections"
          onClick={view.refresh}
          className="shrink-0 px-1 py-0.5 rounded text-text-muted hover:bg-surface cursor-pointer"
        >
          ↻
        </button>
      </div>
    </section>
  );
}

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** How many times the person has asked for it again. */
  retries: number;
}

/**
 * After this many, *Try Again* is not the answer: the error is deterministic
 * and the button only hides it for a frame. Say so, and offer the thing that
 * does help.
 */
const MAX_RETRIES = 3;

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retries: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
          <div className="text-error text-sm font-mono">Something went wrong</div>
          <pre className="text-xs text-text-muted font-mono max-w-md overflow-auto bg-surface/50 rounded-[var(--radius-sm)] p-3 border border-border">
            {this.state.error?.message || 'Unknown error'}
          </pre>
          {this.state.retries < MAX_RETRIES ? (
            <button
              onClick={() =>
                this.setState((prev) => ({
                  hasError: false,
                  error: null,
                  retries: prev.retries + 1,
                }))
              }
              className="px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-accent-muted text-accent border border-accent/20 hover:border-accent transition-colors motion-press cursor-pointer"
            >
              Try Again
            </button>
          ) : (
            <>
              <p className="text-xs text-text-muted max-w-md text-center">
                It has failed {MAX_RETRIES} times, so trying again will not help. Reloading starts
                the app over; your work is on disk and in Growth.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-accent-muted text-accent border border-accent/20 hover:border-accent transition-colors motion-press cursor-pointer"
              >
                Reload
              </button>
            </>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

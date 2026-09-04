import { useState, useRef, useEffect, type ReactNode } from 'react';
import { getModelInfo, PROVIDERS, getProviderForModel } from '@/ai/providers';
import { defaultToolDefinitions } from '@/ai/tools';
import { useCruxStore } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';

interface ModelInfoPanelProps {
  model: string;
  children: ReactNode;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

// No icons — clean text list

export default function ModelInfoPanel({ model, children }: ModelInfoPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showBar, setShowBar] = useState(true);
  const rowRef = useRef<HTMLDivElement>(null);
  const tokenUsage = useCruxStore((s) => s.tokenUsage);
  const messageCount = useCruxStore((s) => s.messages.length);

  const info = getModelInfo(model);
  const providerId = getProviderForModel(model);
  const provider = PROVIDERS[providerId];

  const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;
  const usagePercent = info
    ? Math.min((tokenUsage.inputTokens / info.contextWindow) * 100, 100)
    : 0;
  const barColor =
    usagePercent > 80 ? 'bg-meter-danger' : usagePercent > 50 ? 'bg-meter-warn' : 'bg-meter-fill';

  // Hide progress bar if not enough horizontal space
  useEffect(() => {
    if (!rowRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setShowBar(entry.contentRect.width > 320);
      }
    });
    observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="font-mono text-xs">
      {/* Top row: model selector + usage bar + info toggle */}
      <div ref={rowRef} className="flex items-center gap-2">
        {children}

        {/* Always-visible usage bar — hidden when pane is narrow */}
        {info && totalTokens > 0 && showBar && (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden min-w-8">
              <div
                className={cn('h-full rounded-full transition-all', barColor)}
                style={{ width: `${Math.max(usagePercent, 2)}%` }}
              />
            </div>
            <span
              className={cn(
                'text-2xs whitespace-nowrap',
                usagePercent > 80 ? 'text-error' : 'text-text-muted',
              )}
            >
              {usagePercent.toFixed(0)}%
            </span>
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-text-muted/60 hover:text-text transition-colors cursor-pointer text-xxs whitespace-nowrap"
        >
          <svg
            width="6"
            height="6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className={cn('transition-transform', expanded ? 'rotate-90' : '')}
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          <span>info</span>
        </button>
      </div>

      {/* Expanded info table */}
      {expanded && info && provider && (
        <div className="mt-3 border-t border-border/50 pt-3 pb-1 space-y-4">
          {/* Model stats */}
          <div className="rounded overflow-hidden border border-border/30">
            <div className="flex justify-between items-center px-3 h-8 bg-surface/50">
              <span className="text-text-muted">Context</span>
              <span className="text-text">{formatTokens(info.contextWindow)} tokens</span>
            </div>
            <div className="flex justify-between items-center px-3 h-8">
              <span className="text-text-muted">Max Response</span>
              <span className="text-text">{formatTokens(info.maxOutput)} tokens</span>
            </div>
            <div className="flex justify-between items-center px-3 h-8 bg-surface/50">
              <span className="text-text-muted">Messages</span>
              <span className="text-text">{messageCount}</span>
            </div>
            {totalTokens > 0 && (
              <>
                <div className="flex justify-between items-center px-3 h-8">
                  <span className="text-text-muted">Session</span>
                  <span className="text-text">
                    {formatTokens(tokenUsage.inputTokens)} in ·{' '}
                    {formatTokens(tokenUsage.outputTokens)} out
                  </span>
                </div>
                {tokenUsage.cachedInputTokens > 0 && (
                  <div className="flex justify-between items-center px-3 h-8">
                    <span className="text-text-muted">Cache Reads</span>
                    <span className="text-text">
                      {formatTokens(tokenUsage.cachedInputTokens)} tokens
                    </span>
                  </div>
                )}
                <div className="px-3 py-2 bg-surface/50">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-text-muted">Context Used</span>
                    <span className={cn('text-text', usagePercent > 80 && 'text-error')}>
                      {usagePercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-border/30 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', barColor)}
                      style={{ width: `${Math.max(usagePercent, 1)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-2xs text-text-muted/60">
                    <span>0</span>
                    <span>{formatTokens(info.contextWindow)}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Capabilities */}
          <div className="space-y-1.5">
            <div className="text-text-muted text-2xs uppercase tracking-wider">Capabilities</div>
            <div className="flex gap-1.5 flex-wrap">
              {provider.capabilities.map((cap) => (
                <span key={cap} className="px-2 py-0.5 bg-accent-muted rounded text-text text-xxs">
                  {cap}
                </span>
              ))}
            </div>
          </div>

          {/* Tools grid */}
          <div className="space-y-1.5">
            <div className="text-text-muted text-2xs uppercase tracking-wider">
              Tools ({defaultToolDefinitions().length})
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {defaultToolDefinitions()
                .filter(
                  (tool) =>
                    tool.name !== 'generate_image' || provider.capabilities.includes('Images'),
                )
                .map((tool) => (
                  <span key={tool.name} className="text-text">
                    {tool.name}
                  </span>
                ))}
            </div>
          </div>

          {/* API Key link */}
          <div>
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline text-xxs"
            >
              Manage API key →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useMemo } from 'react';
import { getModelInfo, PROVIDERS, getProviderForModel } from '@/ai/providers';
import { TOOL_DEFINITIONS } from '@/ai/tools';
import { useCruxStore } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';

interface ModelInfoPanelProps {
  model: string;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

function estimateMessageTokens(messages: { content: string }[]): number {
  let total = 0;
  for (const msg of messages) {
    total += Math.ceil((msg.content?.length || 0) / 3.5) + 4;
  }
  return total;
}

const TOOL_ICONS: Record<string, string> = {
  write_file: '✏',
  edit_file: '✎',
  read_file: '📄',
  delete_file: '🗑',
  list_files: '📁',
  generate_image: '🖼',
};

export default function ModelInfoPanel({ model }: ModelInfoPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const messages = useCruxStore((s) => s.messages);

  const info = getModelInfo(model);
  const providerId = getProviderForModel(model);
  const provider = PROVIDERS[providerId];

  const usageEstimate = useMemo(() => {
    if (!info || !messages.length) return 0;
    return estimateMessageTokens(messages);
  }, [messages, info]);

  const usagePercent = info ? Math.min((usageEstimate / info.contextWindow) * 100, 100) : 0;

  if (!info || !provider) return null;

  return (
    <div className="font-mono text-[10px]">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1.5 text-text-muted/50 hover:text-text-muted transition-colors cursor-pointer',
        )}
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
        <span>model info</span>
        {usagePercent > 0 && (
          <span className={cn(
            usagePercent > 80 ? 'text-error' : usagePercent > 50 ? 'text-amber-400' : 'text-text-muted/40',
          )}>
            {usagePercent.toFixed(0)}% context
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2.5 text-text-muted/70 pb-1">
          {/* Context & Output */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>context window</span>
              <span className="text-text-muted">{formatTokens(info.contextWindow)} tokens</span>
            </div>
            <div className="flex justify-between">
              <span>max output</span>
              <span className="text-text-muted">{formatTokens(info.maxOutput)} tokens</span>
            </div>

            {/* Usage bar */}
            {usageEstimate > 0 && (
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span>usage estimate</span>
                  <span className={cn(
                    usagePercent > 80 ? 'text-error' : 'text-text-muted',
                  )}>
                    ~{formatTokens(usageEstimate)} / {formatTokens(info.contextWindow)}
                  </span>
                </div>
                <div className="h-1 bg-surface rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      usagePercent > 80 ? 'bg-error' : usagePercent > 50 ? 'bg-amber-400' : 'bg-accent',
                    )}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Capabilities */}
          <div className="space-y-1">
            <span className="text-text-muted/50 uppercase tracking-wider">capabilities</span>
            <div className="flex gap-1.5 flex-wrap">
              {provider.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="px-1.5 py-0.5 bg-surface rounded text-text-muted"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>

          {/* Tools */}
          <div className="space-y-1">
            <span className="text-text-muted/50 uppercase tracking-wider">tools ({TOOL_DEFINITIONS.length})</span>
            <div className="space-y-0.5">
              {TOOL_DEFINITIONS.map((tool) => (
                <div key={tool.name} className="flex items-center gap-1.5">
                  <span>{TOOL_ICONS[tool.name] || '⚙'}</span>
                  <span className="text-text-muted">{tool.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* API Key link */}
          <div className="pt-0.5">
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              manage API key →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Panel, ApiKeySetup } from '@/components/ui';
import { cn } from '@/lib/cn';

export default function AiSettings() {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <Panel padding="md">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 w-full cursor-pointer group"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'text-text-muted transition-transform duration-150',
            collapsed ? '-rotate-90' : 'rotate-0',
          )}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <h2 className="font-display text-sm font-medium text-accent">AI</h2>
      </button>

      {!collapsed && (
        <div className="mt-5">
          <ApiKeySetup />
        </div>
      )}
    </Panel>
  );
}

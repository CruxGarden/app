import { cn } from '@/lib/cn';

interface ModelOption {
  id: string;
  label: string;
  description: string;
}

const MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4', description: 'Fast and capable' },
  { id: 'claude-opus-4-20250514', label: 'Opus 4', description: 'Most intelligent' },
  { id: 'claude-haiku-3-5-20241022', label: 'Haiku 3.5', description: 'Quick and light' },
];

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

export default function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const current = MODELS.find((m) => m.id === value) ?? MODELS[0]!;

  return (
    <div className="flex items-center gap-1 px-3 pt-2 pb-1">
      {MODELS.map((model) => (
        <button
          key={model.id}
          onClick={() => onChange(model.id)}
          disabled={disabled}
          title={model.description}
          className={cn(
            'px-2 py-0.5 text-[11px] font-mono rounded transition-colors cursor-pointer',
            'disabled:cursor-not-allowed disabled:opacity-50',
            model.id === current.id
              ? 'bg-accent-muted text-accent'
              : 'text-text-muted hover:text-text hover:bg-surface',
          )}
        >
          {model.label}
        </button>
      ))}
    </div>
  );
}

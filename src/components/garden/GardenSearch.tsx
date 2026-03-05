import { useRef, useEffect } from 'react';

interface GardenSearchProps {
  value: string;
  onChange: (query: string) => void;
}

function ClearIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export default function GardenSearch({ value, onChange }: GardenSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync input when value is externally cleared
  useEffect(() => {
    if (!value && inputRef.current && inputRef.current.value !== '') {
      inputRef.current.value = '';
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(query), 250);
  };

  const handleClear = () => {
    if (inputRef.current) inputRef.current.value = '';
    onChange('');
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        onChange={handleChange}
        placeholder="Search cruxes..."
        className="w-full px-3 pr-8 py-2 text-sm bg-surface/50 border border-border rounded-[var(--radius-sm)] text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors font-body"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors cursor-pointer"
        >
          <ClearIcon />
        </button>
      )}
    </div>
  );
}

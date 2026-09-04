import { useRef, useEffect, useState, memo } from 'react';
import { CloseIcon } from '@/components/ui/icons';

interface GardenSearchProps {
  value: string;
  onChange: (query: string) => void;
}

export default memo(function GardenSearch({ value, onChange }: GardenSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [hasText, setHasText] = useState(() => !!value);

  // Sync input when value is externally cleared (e.g. "Clear search" button)
  useEffect(() => {
    if (!value && inputRef.current && inputRef.current.value !== '') {
      inputRef.current.value = '';
      setHasText(false);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setHasText(query.length > 0);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(query), 250);
  };

  const handleClear = () => {
    if (inputRef.current) inputRef.current.value = '';
    setHasText(false);
    clearTimeout(debounceRef.current);
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
        className="w-full px-3 pr-8 py-2 text-sm bg-surface/50 border border-border rounded-[var(--radius-sm)] text-text placeholder:text-text-muted/50 focus:outline-none focus:border-input-border-active focus:ring-1 focus:ring-input-outline transition-colors font-body"
      />
      {hasText && (
        <button
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors cursor-pointer"
        >
          <CloseIcon size={12} />
        </button>
      )}
    </div>
  );
});

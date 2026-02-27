import { useState, useRef, useEffect } from 'react';

interface InlineRenameProps {
  initialValue: string;
  onCommit: (newName: string) => void;
  onCancel: () => void;
}

export default function InlineRename({ initialValue, onCommit, onCancel }: InlineRenameProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed && trimmed !== initialValue) {
        onCommit(trimmed);
      } else {
        onCancel();
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleBlur = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== initialValue) {
      onCommit(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="w-full px-1 py-0.5 text-xs font-mono bg-bg border border-accent rounded-[var(--radius-sm)] text-text outline-none"
    />
  );
}

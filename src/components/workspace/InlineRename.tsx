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

  // Enter and blur both finish the edit, and Enter's commit can open a dialog
  // that steals focus — which fired blur, which committed AGAIN (a second
  // "already exists?" dialog, or a double rename). Finish exactly once.
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const trimmed = value.trim();
    if (trimmed && trimmed !== initialValue) onCommit(trimmed);
    else onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish();
    } else if (e.key === 'Escape') {
      if (doneRef.current) return;
      doneRef.current = true;
      onCancel();
    }
  };

  const handleBlur = () => finish();

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

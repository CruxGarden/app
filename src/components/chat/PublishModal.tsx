import { useState, useCallback } from 'react';
import { Modal, Button } from '@/components/ui';

interface PublishModalProps {
  open: boolean;
  onClose: () => void;
  url: string;
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

export default function PublishModal({ open, onClose, url }: PublishModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [url]);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="space-y-4 text-center">
        <div className="w-12 h-12 rounded-full bg-accent-muted flex items-center justify-center mx-auto">
          <CheckIcon />
        </div>

        <div>
          <h2 className="text-lg font-display font-medium text-text">Shared!</h2>
          <p className="text-sm text-text-muted mt-1">Your creation is live</p>
        </div>

        <div className="flex items-center gap-2 bg-bg rounded-[var(--radius-sm)] p-2">
          <span className="text-sm font-mono text-accent truncate flex-1 text-left">{url}</span>
          <button
            onClick={handleCopy}
            className="shrink-0 p-1.5 rounded-[var(--radius-sm)] text-text-muted hover:text-text hover:bg-surface/50 transition-colors cursor-pointer"
            title="Copy URL"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>

        <div className="flex gap-2 justify-center">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium font-body rounded-[var(--radius-sm)] bg-accent-muted text-accent border border-accent/20 hover:border-accent transition-colors motion-press"
          >
            Open in new tab
          </a>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/cn';

export default function UserMenu() {
  const navigate = useNavigate();
  const { author, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initial = author?.displayName?.charAt(0)?.toUpperCase() ?? '?';

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center',
          'bg-accent-muted text-accent text-xs font-display font-bold',
          'hover:ring-2 hover:ring-accent/30 transition-shadow cursor-pointer',
        )}
      >
        {initial}
      </button>

      {open ? (
        <div
          className={cn(
            'absolute right-0 top-full mt-2 w-48',
            'bg-surface-solid border border-border rounded-[var(--radius)] shadow-xl',
            'py-1 z-50',
          )}
        >
          {author ? (
            <div className="px-3 py-2 border-b border-border">
              <p className="text-sm font-medium text-text truncate">
                {author.displayName}
              </p>
              <p className="text-xs text-text-muted truncate">@{author.username}</p>
            </div>
          ) : null}

          <button
            onClick={() => { setOpen(false); navigate('/settings'); }}
            className="w-full px-3 py-2 text-left text-sm text-text-muted hover:text-text hover:bg-surface transition-colors"
          >
            Settings
          </button>

          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-left text-sm text-error hover:bg-error-muted transition-colors"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

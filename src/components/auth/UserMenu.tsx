import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { cn } from '@/lib/cn';

function SunIcon() {
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
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
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
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
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
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export default function UserMenu() {
  const navigate = useNavigate();
  const { author, logout } = useAuthStore();
  const { mode, setMode } = useThemeStore();
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

  const initial = author?.username?.charAt(0)?.toUpperCase() ?? '?';
  const avatarUrl = (() => {
    if (!author?.meta?.avatarUrl) return null;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    return `${base}${author.meta.avatarUrl}?v=${author.updated}`;
  })();

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
          'w-6 h-6 rounded-full flex items-center justify-center overflow-hidden',
          !avatarUrl && 'bg-accent-muted text-accent text-[10px] font-display font-bold',
          'ring-1 ring-text-muted/20 hover:ring-accent/40 transition-shadow cursor-pointer',
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
        ) : (
          initial
        )}
      </button>

      {open ? (
        <div className="absolute right-0 top-full w-48 pt-2 z-50">
          <div className="bg-surface-solid border border-border rounded-[var(--radius)] shadow-xl py-1">
            {author ? (
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/home');
                }}
                className="w-full px-3 py-2 border-b border-border text-left hover:bg-accent-muted transition-colors cursor-pointer"
              >
                <p className="text-sm font-medium text-text truncate">{author.username}</p>
                <p className="text-xs text-text-muted truncate">Home Garden</p>
              </button>
            ) : null}

            <button
              onClick={() => {
                setOpen(false);
                navigate('/settings');
              }}
              className="w-full px-3 py-2 text-left text-sm text-text-muted hover:text-text hover:bg-accent-muted transition-colors cursor-pointer"
            >
              Settings
            </button>

            <div className="border-t border-border my-1" />

            <button
              onClick={() => setMode('light')}
              className={cn(
                'w-full px-3 py-2 text-left text-sm hover:bg-accent-muted transition-colors flex items-center gap-2 cursor-pointer',
                mode === 'light' ? 'text-text' : 'text-text-muted hover:text-text',
              )}
            >
              <SunIcon />
              Light
            </button>
            <button
              onClick={() => setMode('dark')}
              className={cn(
                'w-full px-3 py-2 text-left text-sm hover:bg-accent-muted transition-colors flex items-center gap-2 cursor-pointer',
                mode === 'dark' ? 'text-text' : 'text-text-muted hover:text-text',
              )}
            >
              <MoonIcon />
              Dark
            </button>
            <button
              onClick={() => setMode('auto')}
              className={cn(
                'w-full px-3 py-2 text-left text-sm hover:bg-accent-muted transition-colors flex items-center gap-2 cursor-pointer',
                mode === 'auto' ? 'text-text' : 'text-text-muted hover:text-text',
              )}
            >
              <MonitorIcon />
              System
            </button>

            <div className="border-t border-border my-1" />

            <button
              onClick={handleLogout}
              className="w-full px-3 py-2 text-left text-sm text-error hover:bg-error-muted transition-colors cursor-pointer"
            >
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

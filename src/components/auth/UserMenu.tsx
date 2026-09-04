import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { useAppStore } from '@/stores/appStore';
import { useThemeStore } from '@/stores/themeStore';
import { ThemeMode } from '@/lib/types';
import { cn } from '@/lib/cn';
import { useDismiss } from '@/hooks/useDismiss';
import { useShallow } from 'zustand/react/shallow';
import { SunIcon, MoonIcon, MonitorIcon } from '@/components/ui/icons';

export default function UserMenu() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const author = useAppStore((s) => s.author);
  const { mode, setMode } = useThemeStore(
    useShallow((s) => ({ mode: s.mode, setMode: s.setMode })),
  );
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, close, open);

  const initial = author?.username?.charAt(0)?.toUpperCase() ?? '?';
  const avatarUrl = useAvatarUrl(author);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/home', { replace: true });
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'w-6 h-6 rounded-[var(--radius-sm)] flex items-center justify-center overflow-hidden',
          !avatarUrl &&
            'bg-profile-button text-profile-button-icon text-2xs font-display font-bold',
          'ring-1 ring-profile-button-border hover:ring-profile-button-hover transition-shadow cursor-pointer',
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open ? (
        <div className="absolute right-0 top-full w-48 pt-2 z-50">
          <div className="bg-dropdown border border-dropdown-border rounded-dropdown shadow-dropdown py-1">
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
                useUIStore.getState().setSettingsOpen(true);
              }}
              className="w-full px-3 py-2 text-left text-sm text-text-muted hover:text-text hover:bg-accent-muted transition-colors cursor-pointer"
            >
              <span className="flex items-center justify-between w-full">
                Settings
                <kbd className="text-xxs font-mono text-text-muted ml-4">⌘,</kbd>
              </span>
            </button>

            <div className="border-t border-border my-1" />

            <button
              onClick={() => setMode(ThemeMode.Light)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm hover:bg-accent-muted transition-colors flex items-center gap-2 cursor-pointer',
                mode === 'light' ? 'text-text' : 'text-text-muted hover:text-text',
              )}
            >
              <SunIcon />
              Light
            </button>
            <button
              onClick={() => setMode(ThemeMode.Dark)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm hover:bg-accent-muted transition-colors flex items-center gap-2 cursor-pointer',
                mode === 'dark' ? 'text-text' : 'text-text-muted hover:text-text',
              )}
            >
              <MoonIcon />
              Dark
            </button>
            <button
              onClick={() => setMode(ThemeMode.Auto)}
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

import { useState, useRef, useCallback, useEffect } from 'react';
import { Avatar, menuItemClass } from '@/components/ui';
import PlasmaOverlay from '@/components/plasma/PlasmaOverlay';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { useAppStore } from '@/stores/appStore';
import { useThemeStore } from '@/stores/themeStore';
import { ThemeMode } from '@/lib/types';
import { useDismiss } from '@/hooks/useDismiss';
import { useShallow } from 'zustand/react/shallow';
import { SunIcon, MoonIcon, MonitorIcon, CheckIcon } from '@/components/ui/icons';

export default function UserMenu() {
  const navigate = useNavigate();
  const disconnectAccount = useAuthStore((s) => s.disconnectAccount);
  const author = useAppStore((s) => s.author);
  const { mode, setMode } = useThemeStore(
    useShallow((s) => ({ mode: s.mode, setMode: s.setMode })),
  );
  const [open, setOpen] = useState(false);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  // The top bar the menu grows out of, for the Plasma overlay.
  const barRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    barRef.current = menuRef.current?.closest<HTMLElement>('.bg-toolbar') ?? null;
  }, [open]);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, close, open);

  const initial = author?.username?.charAt(0)?.toUpperCase() ?? '?';
  const avatarUrl = useAvatarUrl(author);

  const handleLogout = async () => {
    setOpen(false);
    // The account is the connection to crux.garden; the author is who you are
    // in your own garden, and it is kept — signing out is not forgetting. The
    // work in front stays in front (it used to jump to Home, and not always).
    await disconnectAccount();
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-[var(--radius-sm)] ring-1 ring-profile-button-border hover:ring-profile-button-hover hover:ring-2 active-dim motion-press cursor-pointer"
      >
        <Avatar
          url={avatarUrl}
          initial={initial}
          fallbackClassName="bg-profile-button text-profile-button-icon"
        />
      </button>

      {open ? (
        <div className="absolute right-0 top-full w-48 pt-2 z-50" data-plasma-host="right">
          {/* Under Plasma the menu is material grown out of the top bar: an
              overlay draws the bar and the menu as one fused shape (PlasmaOverlay). */}
          <PlasmaOverlay
            surfaces={[
              { ref: barRef, radius: 14, fuse: true, formIn: false, elevation: 0.5, claim: true },
              { ref: menuPanelRef, radius: 12, fuse: true, elevation: 0.5 },
            ]}
            zIndex={-1}
            canvasStyle={{ position: 'fixed' }}
          />
          <div
            ref={menuPanelRef}
            className="bg-dropdown border border-dropdown-border rounded-dropdown shadow-dropdown p-1 motion-enter-dropdown"
          >
            {author ? (
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/home');
                }}
                className={menuItemClass('default', 'flex-col items-start gap-0')}
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
              className={menuItemClass()}
            >
              <span className="flex items-center justify-between w-full">
                Settings
                <kbd className="text-xxs font-mono text-text-muted ml-4">⌘,</kbd>
              </span>
            </button>

            <div className="divider my-1" />

            <button
              onClick={() => setMode(ThemeMode.Light)}
              aria-current={mode === 'light' || undefined}
              className={menuItemClass(
                'default',
                mode !== 'light' && 'text-text-muted hover:text-text',
              )}
            >
              <SunIcon />
              <span className="flex-1">Light</span>
              {mode === 'light' && <CheckIcon size={14} />}
            </button>
            <button
              onClick={() => setMode(ThemeMode.Dark)}
              aria-current={mode === 'dark' || undefined}
              className={menuItemClass(
                'default',
                mode !== 'dark' && 'text-text-muted hover:text-text',
              )}
            >
              <MoonIcon />
              <span className="flex-1">Dark</span>
              {mode === 'dark' && <CheckIcon size={14} />}
            </button>
            <button
              onClick={() => setMode(ThemeMode.Auto)}
              aria-current={mode === 'auto' || undefined}
              className={menuItemClass(
                'default',
                mode !== 'auto' && 'text-text-muted hover:text-text',
              )}
            >
              <MonitorIcon />
              <span className="flex-1">System</span>
              {mode === 'auto' && <CheckIcon size={14} />}
            </button>

            <div className="divider my-1" />

            <button onClick={handleLogout} className={menuItemClass('danger')}>
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

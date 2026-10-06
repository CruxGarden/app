import { useEffect, useId, useRef, useState } from 'react';
import { Input, SectionLabel, buttonClass } from '@/components/ui';
import { SproutIcon } from '@/components/ui/icons';
import { toast } from '@/stores/toastStore';
import { Disclosure } from './setup-ui';
import ConnectAccount from '@/components/auth/ConnectAccount';
import { Capability, can } from '@/lib/platform';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import GardenFolderField from './GardenFolderField';
import { isPlaceholderUsername, usernameFormatError } from './setup-plan';
import { useSetupWizard } from './setup-store';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Step 2 — the Garden's name and folder; optionally a username, a photo and a sign-in. */
export default function StepGarden({
  usernameError,
  onUsernameError,
}: {
  usernameError: string;
  onUsernameError: (error: string) => void;
}) {
  const gardenName = useSetupWizard((s) => s.gardenName);
  const username = useSetupWizard((s) => s.username);
  const photo = useSetupWizard((s) => s.photo);
  const set = useSetupWizard((s) => s.set);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const folderLabel = useId();
  const okId = useId();
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const author = useAppStore((s) => s.author);
  const current = useAvatarUrl(author);
  const preview = usePhotoUrl(photo) ?? current;

  // A slow answer about "dan" must not mark "daniel" as taken.
  const typed = useRef(username.trim());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const report = onUsernameError;
  const changeUsername = (value: string) => {
    set({ username: value });
    const name = value.trim();
    typed.current = name;
    const format = usernameFormatError(name);
    report(format);
    if (timer.current) clearTimeout(timer.current);
    if (format || !name || !useAuthStore.getState().isAuthenticated) return;
    timer.current = setTimeout(async () => {
      try {
        const { authors } = await import('@/api');
        const { available } = await authors.checkUsername(name.toLowerCase());
        if (typed.current === name && !available) report('Username is taken at crux.garden');
      } catch {
        /* crux.garden unreachable: the name is checked again when it is used */
      }
    }, 400);
  };

  const name = gardenName.trim() || 'My Garden';
  const handle = username.trim();
  const handleOk = !!handle && !usernameError;

  return (
    <div className="flex flex-col gap-5">
      {/* The Home header, as it will read */}
      <div
        aria-hidden
        data-testid="setup-home-preview"
        className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2.5"
      >
        <span className="text-accent shrink-0">
          <SproutIcon size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-2xs font-mono uppercase tracking-wider text-text-muted">
            Home Garden
          </span>
          <span className="block truncate font-display text-base text-text">{name}</span>
        </span>
        {handle && <span className="text-xs font-mono text-text-muted truncate">@{handle}</span>}
        <span className="w-8 h-8 shrink-0 rounded-full border border-border bg-surface overflow-hidden flex items-center justify-center text-xs text-text-muted">
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            (handle[0] ?? name[0] ?? '?').toUpperCase()
          )}
        </span>
      </div>

      <label className="flex flex-col gap-1.5">
        <SectionLabel tone="muted">Name your garden</SectionLabel>
        <Input
          value={gardenName}
          placeholder="My Garden"
          onChange={(e) => set({ gardenName: e.target.value })}
          maxLength={200}
          data-enter-continues=""
          autoFocus
        />
      </label>

      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">
          About you, if you like. You can also pick a name the first time you share something.
        </p>
        <label className="flex flex-col gap-1.5">
          <SectionLabel tone="muted">Username</SectionLabel>
          <Input
            value={username}
            placeholder="wanderer"
            autoComplete="username"
            onChange={(e) => changeUsername(e.target.value)}
            error={usernameError || undefined}
            aria-describedby={handleOk ? okId : undefined}
            data-enter-continues=""
            className="font-mono"
          />
          {handleOk && (
            <span id={okId} className="text-xs text-accent" aria-live="polite">
              Lovely — that name works.
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonClass('secondary', 'xs')}
            onClick={() => fileRef.current?.click()}
          >
            {photo ? 'Change photo' : 'Add a photo'}
          </button>
          {photo && (
            <button
              type="button"
              className={buttonClass('ghost', 'xs')}
              onClick={() => set({ photo: null })}
            >
              Remove photo
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Photo"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (file.size > MAX_PHOTO_BYTES) {
                setPhotoError('That photo is over 10 MB. Try a smaller one.');
                return;
              }
              setPhotoError('');
              set({ photo: file });
            }}
          />
        </div>
        {photoError && (
          <p role="alert" className="text-xs text-error">
            {photoError}
          </p>
        )}
      </div>

      <Disclosure label="More options" hint="folder, account" testId="setup-garden-more">
        {can(Capability.ProjectFolder) && (
          <div className="flex flex-col gap-1.5">
            <SectionLabel tone="muted" id={folderLabel}>
              Where your work is saved
            </SectionLabel>
            <GardenFolderField labelId={folderLabel} />
            <p className="text-xs text-text-muted">
              Each thing you make is a real folder here, so other apps and editors can open it too.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <SectionLabel tone="muted">
            {isAuthenticated ? 'Signed in to crux.garden' : 'Already have a crux.garden account?'}
          </SectionLabel>
          <ConnectAccount
            compact
            description="Sign in to back up, share and use what your plan includes."
            onConnected={() => {
              toast('Signed in. Welcome back.');
              // An account that already has a real name brings it along.
              const remote = useAppStore.getState().author?.username;
              if (!isPlaceholderUsername(remote) && !username.trim()) changeUsername(remote!);
              else if (username.trim()) changeUsername(username);
            }}
            onDisconnected={() => {
              if (usernameError.includes('crux.garden')) report('');
            }}
          />
        </div>
      </Disclosure>
    </div>
  );
}

function usePhotoUrl(photo: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(photo);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo]);
  return url;
}

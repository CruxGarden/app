import { useState, useRef } from 'react';
import { buttonClass } from '@/components/ui/button-class';
import { useAppStore } from '@/stores/appStore';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { alertDialog } from '@/stores/dialogStore';

const btnClass = cn(buttonClass('secondary', 'xs'));

interface AvatarUploadProps {
  /** Compact layout — smaller avatar, tighter spacing */
  compact?: boolean;
}

/**
 * Reusable avatar upload.
 * Used in Settings (AccountSettings).
 */
export default function AvatarUpload({ compact }: AvatarUploadProps) {
  const author = useAppStore((s) => s.author);
  const uploadAvatar = useAppStore((s) => s.uploadAvatar);
  const removeAvatar = useAppStore((s) => s.removeAvatar);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarSize = compact ? 'w-10 h-10' : 'w-14 h-14';
  const initial = author?.username?.charAt(0)?.toUpperCase() ?? '?';
  const avatar = useAvatarUrl(author);

  const MAX_AVATAR_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    if (file.size > MAX_AVATAR_SIZE) {
      void alertDialog('Avatar must be under 10MB.', 'Image too large');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      // Ensure author exists (defensive — should already be created by Banner step or Shell init)
      if (!useAppStore.getState().author) await useAppStore.getState().ensureAuthor();
      await uploadAvatar(file);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setError('Could not save your photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setUploading(true);
    try {
      await removeAvatar();
    } catch (err) {
      console.error('Avatar remove failed:', err);
      setError('Could not remove your photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          {avatar ? (
            <img
              src={avatar}
              alt="Avatar"
              className={cn(avatarSize, 'rounded-[var(--radius)] object-cover')}
            />
          ) : (
            <div
              className={cn(
                avatarSize,
                'rounded-[var(--radius)] flex items-center justify-center bg-accent-muted text-accent font-body font-bold',
                compact ? 'text-sm' : 'text-lg',
              )}
            >
              {initial}
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[var(--radius)] bg-bg/(--tint-medium)">
              <Spinner size={compact ? 12 : 16} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={btnClass}
          >
            {uploading ? 'Uploading...' : avatar ? 'Change' : 'Upload photo'}
          </button>
          {avatar && (
            <button
              onClick={handleRemove}
              disabled={uploading}
              className={buttonClass(
                'ghost',
                'xs',
                'text-error hover:text-error hover:bg-error-muted',
              )}
            >
              Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}

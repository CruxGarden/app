import { useAiEnabled } from '@/hooks/useAiEnabled';

/** Every private backup includes its complete retained content inventory. */
export default function PrivateBackupDescription({
  installation = false,
}: {
  installation?: boolean;
}) {
  const aiEnabled = useAiEnabled();
  return (
    <p className="text-xs text-text-muted">
      {installation
        ? `Includes every Garden and Crux, files, tools, Moods, ${aiEnabled ? 'conversations, ' : ''}Tasks, Growth and local settings. Restore replaces this installation. Sign in again afterward.`
        : `Includes your files, the tool's own files, ${aiEnabled ? 'conversation, ' : ''}Tasks and Growth. This private backup is self-contained: it opens in any Crux Garden. A tool that is not installed there still opens; only its commands wait for the tool.`}
    </p>
  );
}

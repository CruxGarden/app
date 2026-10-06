import { useNavigate } from 'react-router-dom';
import { publicApi } from '@/api';
import type { ExploreCrux } from '@/api/public';
import { useAppStore } from '@/stores/appStore';
import { publishBaseUrlFor, hasRemotePublishOrigin } from '@/lib/public-url';
import CruxResultCard from './CruxResultCard';
import ToolResultCard from './ToolResultCard';
import MoodResultCard from './MoodResultCard';

/** Explore and public Gardens present the same publication and installation contract. */
export default function PublishedCreationCard({
  crux,
  onNavigate,
  activeTags = [],
  onTag,
  kindLabel,
}: {
  crux: ExploreCrux;
  onNavigate?: (path: string) => void;
  activeTags?: string[];
  onTag: (tag: string) => void;
  kindLabel?: string;
}) {
  const navigate = useNavigate();
  const ready = useAppStore((s) => s.ready);
  const open = () => (onNavigate ?? navigate)(`/${crux.author_username}/${crux.slug}`);
  if (crux.kind === 'tool')
    return (
      <ToolResultCard
        crux={crux}
        canInstall={ready}
        onOpen={open}
        onInstall={async (options) => {
          const [{ installToolFromPublished }, { putBlob }] = await Promise.all([
            import('@/services/crux-tools/installed'),
            import('@/services/blobs'),
          ]);
          await installToolFromPublished(crux, {
            apiDownload: publicApi.downloadArtifact,
            putBlob,
            ...options,
          });
        }}
      />
    );
  if (crux.kind === 'mood')
    return (
      <MoodResultCard
        crux={crux}
        canInstall={ready}
        onOpen={open}
        onInstall={async (apply) => {
          const [{ installMoodFromPublished }, { chooseMood }, { putBlob }] = await Promise.all([
            import('@/lib/moods/publish-mood'),
            import('@/services/garden-mood'),
            import('@/services/blobs'),
          ]);
          const pkg = await installMoodFromPublished(crux, {
            publishBaseUrl: publishBaseUrlFor,
            fetchBlob: async (url) => {
              if (!hasRemotePublishOrigin()) return null;
              const response = await fetch(url);
              if (
                !response.ok ||
                (response.headers.get('content-type') || '').startsWith('text/html')
              )
                return null;
              return response.blob();
            },
            apiArtifacts: publicApi.getArtifacts,
            apiDownload: publicApi.downloadArtifact,
            putBlob,
          });
          if (!pkg) throw new Error('No package found');
          if (apply) await chooseMood(pkg);
        }}
      />
    );
  return <CruxResultCard crux={crux} activeTags={activeTags} onTag={onTag} kindLabel={kindLabel} />;
}

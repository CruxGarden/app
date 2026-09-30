import { Link } from 'react-router-dom';
import { Avatar } from '@/components/ui';
import type { ExploreCrux } from '@/api/public';
import { resolveExploreAvatar } from './author';

/** The same creator identity accompanies creations, Tools and Moods. */
export default function ExploreCreator({ crux }: { crux: ExploreCrux }) {
  const name = crux.author_display_name || crux.author_username;
  return (
    <Link
      to={`/${crux.author_username}`}
      aria-label={`Visit ${name}'s Garden`}
      className="my-2 flex w-fit max-w-full items-center gap-2.5 rounded-sm text-text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Avatar
        url={resolveExploreAvatar(crux.author_meta)}
        initial={name.slice(0, 1).toUpperCase()}
        className="!w-8 !h-8 !rounded-full"
      />
      <span className="min-w-0 text-xs">
        <span className="block truncate font-medium text-text">{name}</span>
        {crux.author_display_name && (
          <span className="block truncate">@{crux.author_username}</span>
        )}
      </span>
    </Link>
  );
}

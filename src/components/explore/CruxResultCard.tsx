import { useState } from 'react';
import { Link } from 'react-router-dom';
import { chipClass } from '@/components/ui';
import type { ExploreCrux } from '@/api/public';
import { publicCoverUrl } from '@/lib/public-cover';
import ExploreCreator from './ExploreCreator';

/** A creation leads; its creator and topics are separate, ordinary links/actions. */
export default function CruxResultCard({
  crux,
  kindLabel,
  activeTags,
  onTag,
}: {
  crux: ExploreCrux;
  kindLabel?: string;
  activeTags: string[];
  onTag: (tag: string) => void;
}) {
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const cover = publicCoverUrl(crux.id);
  const title = crux.title || crux.slug;
  return (
    <article
      className="group min-w-0 overflow-hidden rounded-[var(--radius)] border border-border bg-panel transition-shadow hover:shadow-card-hover"
      data-testid={`explore-crux-${crux.id}`}
    >
      <Link
        to={`/${crux.author_username}/${crux.slug}`}
        aria-label={title}
        className="block focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]"
      >
        <div className="relative aspect-video overflow-hidden bg-garden-card-thumbnail">
          {failedCover !== cover ? (
            <img
              src={cover}
              alt={`Preview of ${title}`}
              width={800}
              height={500}
              loading="lazy"
              decoding="async"
              onError={() => setFailedCover(cover)}
              className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.025]"
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-accent-muted to-surface text-text-muted">
              <span
                className="text-5xl font-display opacity-[var(--decoration-opacity)]"
                aria-hidden
              >
                {title.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-xs">Preview coming soon</span>
            </div>
          )}
          {kindLabel && (
            <span className="absolute bottom-3 left-3 rounded-full border border-border bg-panel px-2.5 py-1 text-xs text-text">
              {kindLabel}
            </span>
          )}
        </div>
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-base font-medium leading-snug text-text line-clamp-2 group-hover:text-accent">
            {title}
          </h3>
          {crux.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-text-muted line-clamp-2">
              {crux.description}
            </p>
          )}
        </div>
      </Link>
      <div className="px-4 pb-4">
        <ExploreCreator crux={crux} />
        {!!crux.tags?.length && (
          <div className="flex flex-wrap gap-1.5 pt-2" aria-label={`Topics in ${title}`}>
            {crux.tags.slice(0, 3).map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={activeTags.includes(tag)}
                onClick={() => onTag(tag)}
                className={chipClass(activeTags.includes(tag), 'min-h-7 px-2 text-xs')}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

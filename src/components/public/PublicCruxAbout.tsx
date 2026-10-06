import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChatMessage, Crux } from '@/api/types';
import { buttonClass } from '@/components/ui/button-class';
import MetadataContent from '@/components/workspace/MetadataContent';

/**
 * "About this creation" on a public Crux page: title, creator, purpose and
 * "How was this made?". The public page and "Preview as a visitor" render the
 * same panel, so the preview cannot drift from what visitors see.
 */
export default function PublicCruxAbout({
  crux,
  username,
  transcript,
  conversation,
  preview = false,
}: {
  crux: Crux;
  username: string;
  transcript: ChatMessage[];
  /** 'private' when the creator kept the conversation to themselves (CR06). */
  conversation: 'shared' | 'private';
  /** Rendered inside the workspace preview: links stay inert. */
  preview?: boolean;
}) {
  const [visibleMessages, setVisibleMessages] = useState(6);
  useEffect(() => setVisibleMessages(6), [crux.id]);
  const handle = username.replace(/^@/, '');
  const purpose =
    crux.description ||
    (typeof crux.meta?.summary?.purpose === 'string' ? crux.meta.summary.purpose : '');
  const shown = conversation === 'shared' ? transcript : [];
  return (
    <aside
      aria-label="About this creation"
      className="w-full sm:w-[360px] sm:max-w-[42%] shrink-0 border-l border-border bg-bg overflow-y-auto p-4 space-y-5"
    >
      <div>
        <h1 className="text-xl font-medium text-text break-words">{crux.title || crux.slug}</h1>
        {preview ? (
          <span className="inline-block mt-2 text-sm text-accent">By @{handle}</span>
        ) : (
          <Link to={`/${username}`} className="inline-block mt-2 text-sm text-accent">
            By @{handle}
          </Link>
        )}
        {purpose && (
          <p className="mt-3 text-sm leading-relaxed text-text-muted whitespace-pre-wrap break-words">
            {purpose}
          </p>
        )}
      </div>
      <div className="rounded-[var(--radius)] border border-border p-3">
        <p className="text-sm mb-2">Make a little place for your own idea.</p>
        <a
          href="/docs/start/get-started/"
          className={buttonClass('secondary', 'sm')}
          onClick={preview ? (event) => event.preventDefault() : undefined}
        >
          Get started with Crux Garden
        </a>
      </div>
      {shown.length > 0 ? (
        <details data-testid="public-conversation">
          <summary className="cursor-pointer text-sm font-medium">How this was made</summary>
          <p className="mt-2 text-xs text-text-muted">
            The conversation this creator published with the project.
          </p>
          <ol className="mt-3 space-y-4">
            {shown.slice(0, visibleMessages).map((message, index) => (
              <li key={index} className="text-sm">
                <p className="font-medium text-accent mb-1">
                  {message.role === 'assistant' ? 'Collaborator' : 'Person'}
                </p>
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {message.content || 'Worked with project tools.'}
                </p>
              </li>
            ))}
          </ol>
          {visibleMessages < shown.length && (
            <button
              className={buttonClass('secondary', 'sm', 'mt-3')}
              onClick={() => setVisibleMessages((count) => count + 6)}
            >
              Read more of the conversation
            </button>
          )}
        </details>
      ) : (
        <p className="text-xs text-text-muted" data-testid="public-conversation-private">
          The creator kept the conversation private.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-text-muted">Project details</summary>
        <MetadataContent
          crux={crux}
          summary={crux.meta?.summary}
          authorName={username}
          messages={shown}
          readOnly
          tagLink={preview ? undefined : (tag) => `/explore?tag=${encodeURIComponent(tag)}`}
        />
      </details>
    </aside>
  );
}

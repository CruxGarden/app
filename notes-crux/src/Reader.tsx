import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { resolveNotePath } from './bridge';
import './notebook.css';
export type Edition = {
  title: string;
  pages: { path: string; markdown: string }[];
  images: Record<string, string>;
};
export default function Reader({ edition }: { edition: Edition }) {
  const [selected, setSelected] = useState(edition.pages[0]?.path ?? '');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const navigate = () => {
      try {
        const path = decodeURIComponent(location.hash.slice(1));
        if (edition.pages.some((p) => p.path === path)) setSelected(path);
      } catch {
        /* malformed bookmark */
      }
    };
    navigate();
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [edition]);
  const page = edition.pages.find((p) => p.path === selected);
  return (
    <div className="reader">
      <aside>
        <small>PUBLIC NOTEBOOK</small>
        <h1>{edition.title}</h1>
        <input
          aria-label="Search notebook"
          placeholder="Search pages…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav>
          {edition.pages
            .filter((p) => (p.path + p.markdown).toLowerCase().includes(query.toLowerCase()))
            .map((p) => (
              <a key={p.path} href={'#' + encodeURIComponent(p.path)}>
                {p.path.replace(/\.md$/i, '')}
              </a>
            ))}
        </nav>
        <small>
          Grown in Crux Garden
          <br />A read-only edition
        </small>
      </aside>
      <article>
        {page && <h2>{page.path.split('/').pop()?.replace(/\.md$/i, '')}</h2>}
        {page && (
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                const target = href ? resolveNotePath(page.path, href) : null;
                return target ? (
                  edition.pages.some((p) => p.path === target) ? (
                    <a href={'#' + encodeURIComponent(target)}>{children}</a>
                  ) : (
                    <span>{children}</span>
                  )
                ) : (
                  <a href={href} rel="noreferrer">
                    {children}
                  </a>
                );
              },
              img: ({ src, alt }) => {
                const target = typeof src === 'string' ? resolveNotePath(page.path, src) : null;
                const image = target ? edition.images[target] : undefined;
                return image ? <img src={image} alt={alt ?? ''} /> : <span>{alt}</span>;
              },
            }}
          >
            {page.markdown}
          </Markdown>
        )}
      </article>
    </div>
  );
}

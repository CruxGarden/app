import PageHeader from '@/components/layout/PageHeader';
import { PublicFooter } from '@/components/public/LegalLinks';
import { linkClass } from '@/components/ui/button-class';
import { canonicalUrl, usePageMeta } from '@/hooks/usePageMeta';
import { APP_NAME } from '@/lib/constants';
import { LEGAL_DOCUMENTS, LEGAL_LAST_UPDATED, formatLegalDate } from '@/lib/legal';
import { contactTarget, type LegalPath } from '@/lib/site';

/** /terms, /privacy and /contact: one readable column on a panel. */
export default function Legal({ page }: { page: LegalPath }) {
  const document = LEGAL_DOCUMENTS[page];
  const contact = contactTarget();
  usePageMeta({
    title: `${document.title} — ${APP_NAME}`,
    description: document.summary,
    canonical: canonicalUrl(document.path),
  });

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader title={document.title} />

      <main className="relative z-10 w-full max-w-2xl mx-auto px-4 sm:px-8 py-8 sm:py-10 rounded-[var(--radius)] bg-panel border border-panel-border shadow-panel mt-6 mb-6 text-panel-text break-words">
        <h1 className="font-display text-3xl text-text">{document.title}</h1>
        <p className="text-sm text-text-muted mt-2">{document.summary}</p>
        <p className="text-xs text-text-muted mt-2">
          Last updated{' '}
          <time dateTime={LEGAL_LAST_UPDATED}>{formatLegalDate(LEGAL_LAST_UPDATED)}</time>
        </p>

        {document.sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="font-display text-lg text-text">{section.heading}</h2>
            {section.paragraphs?.map((text) => (
              <p key={text} className="text-sm leading-relaxed text-text-muted mt-2">
                {text}
              </p>
            ))}
            {section.list && (
              <ul className="list-disc pl-5 mt-2 space-y-1.5 text-sm leading-relaxed text-text-muted">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {section.after?.map((text) => (
              <p key={text} className="text-sm leading-relaxed text-text-muted mt-2">
                {text}
              </p>
            ))}
            {section.links?.map((link) => (
              <p key={link.href} className="text-sm mt-2">
                <a
                  href={link.href}
                  className={linkClass()}
                  {...(link.href.startsWith('http') ? { rel: 'noreferrer' } : {})}
                >
                  {link.label}
                </a>
              </p>
            ))}
          </section>
        ))}

        <section className="mt-8" aria-label="Get in touch">
          <h2 className="font-display text-lg text-text">
            {page === '/contact' ? 'Write to us' : 'Questions'}
          </h2>
          <p className="text-sm leading-relaxed text-text-muted mt-2">
            {contact.kind === 'email'
              ? 'For anything about these pages, your account or your data, write to '
              : 'For anything about these pages, open an issue at '}
            <a href={contact.href} className={linkClass()} rel="noreferrer">
              {contact.label}
            </a>
            .
          </p>
        </section>
      </main>

      <PublicFooter className="pb-10 pt-0" />
    </div>
  );
}

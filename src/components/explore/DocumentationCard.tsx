import { buttonClass } from '@/components/ui';
import { openFieldGuide } from '@/stores/fieldGuide';

export default function DocumentationCard({ local }: { local: boolean }) {
  return (
    <section
      aria-label="Crux Garden field guide"
      className="rounded-[var(--radius)] border border-border bg-panel p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text">New here? Start with something small.</h3>
          <p className="text-xs text-text-muted">Make your first page. No AI needed.</p>
        </div>
        {local ? (
          <button className={buttonClass('secondary', 'sm')} onClick={() => openFieldGuide()}>
            Read the field guide →
          </button>
        ) : (
          <a className={buttonClass('secondary', 'sm')} href="/docs/">
            Read the field guide →
          </a>
        )}
      </div>
    </section>
  );
}

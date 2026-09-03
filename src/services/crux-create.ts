import type { Crux, CruxKind, ChatMessage } from '@/api/types';
import { getServices } from './index';
import { loadTemplate, applyTemplateMeta, type TemplateLayout } from '@/templates';

/**
 * "New crux from a template" as one operation — file creation, the desktop
 * scaffold script, and the meta stamping (greeting, AI context, Builder
 * inputs). This used to be a 90-line transaction inside NewCruxModal, which
 * meant the use case had no owner and no test, and its failures vanished.
 *
 * The caller creates the bare crux first (the workspace store owns that, so
 * the UI is consistent) and hands it in.
 */
export interface TemplateApplyResult {
  crux: Crux;
  /** The template's greeting as the opening conversation, if it has one. */
  messages: ChatMessage[] | null;
  /** Workspace layout the template asks for, if any. */
  layout: TemplateLayout | null;
}

export async function applyTemplateToCrux(
  crux: Crux,
  templateId: string,
  kind: CruxKind,
): Promise<TemplateApplyResult> {
  const def = await loadTemplate(templateId);
  const services = getServices();
  if (!def) {
    const updated = await services.crux.update(crux.id, { kind });
    return { crux: updated, messages: null, layout: null };
  }

  for (const file of def.files) {
    await services.artifact.create({
      resourceId: crux.id,
      content: file.content,
      meta: { path: file.path },
    });
  }

  // Script-driven setup (desktop): files it writes reach the store through
  // ingestion. Failure is non-fatal — the embedded files stand.
  if (def.scaffold) {
    try {
      const { runScaffold } = await import('./site');
      await runScaffold(crux.id, def.scaffold.pnpmArgs);
    } catch (err) {
      console.error('[template] scaffold failed:', err);
    }
  }

  const meta = applyTemplateMeta(crux.meta as Record<string, unknown>, def);
  const updated = await services.crux.update(crux.id, { kind, meta });
  return {
    crux: updated,
    messages: def.greeting ? (meta.messages as ChatMessage[]) : null,
    layout: def.layout ?? null,
  };
}

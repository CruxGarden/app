import {
  getPersona,
  getPersonaFingerprint,
  personaSnapshotOf,
  type PersonaSnapshot,
} from './persona';
import { installedTool, installedToolPackage } from './crux-tools/installed';
import { toolManifest } from './crux-tools/registry';
import type { Crux, CruxKind, ChatMessage } from '@/api/types';
import { getServices } from './index';
import {
  loadTemplate,
  applyTemplateMeta,
  templateFromManifest,
  type TemplateLayout,
} from '@/templates';
import { syncAgentsMd } from './agents-md';

/**
 * "New crux from a template" as one operation — file creation, the desktop
 * scaffold script, and the meta stamping (greeting, AI context, Builder
 * inputs), owned and tested here rather than in the dialog.
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
  // Creation already captured its speaker before async API admission. The template
  // replaces that greeting, so retain the same speaker even after navigation/Mood changes.
  const initialFingerprint = crux.meta?.messages?.find(
    (message) => message.role === 'assistant' && message.personaFingerprint,
  )?.personaFingerprint;
  const snapshots = crux.meta?.personaSnapshots as Record<string, PersonaSnapshot> | undefined;
  const initialPersona = initialFingerprint ? snapshots?.[initialFingerprint] : undefined;
  const persona = structuredClone(initialPersona ?? getPersona());
  const fingerprint = initialPersona ? initialFingerprint! : getPersonaFingerprint(persona);
  let def = await loadTemplate(templateId);
  const services = getServices();
  // A tool installed into this garden rather than built in: its files are
  // unpacked from its local immutable package into normal working Artifacts.
  // Legacy installations still share their existing file fingerprints.
  const installed = !def ? installedTool(templateId) : null;
  const manifest = installed ? toolManifest(templateId) : null;
  if (installed && manifest) {
    const packageVersion = await installedToolPackage(installed);
    if (packageVersion) {
      const { putBlob } = await import('./blobs');
      const registrations = [];
      for (const file of packageVersion.files) {
        const bytes = await file.read();
        const fingerprint = await putBlob(bytes);
        registrations.push({
          resourceId: crux.id,
          path: file.path,
          fingerprint,
          size: bytes.length,
          mimeType: file.mimeType,
          encoding: /^(text\/|application\/(javascript|json|xml))/.test(file.mimeType)
            ? 'utf-8'
            : 'binary',
          meta: { path: file.path },
        });
      }
      await services.artifact.registerMany(registrations);
    } else {
      const source = await services.artifact.findByResource('crux', installed.cruxId);
      await services.artifact.registerMany(
        source
          .filter((a) => a.fingerprint)
          .map((a) => {
            const path = a.meta?.path || a.filename;
            return {
              resourceId: crux.id,
              path,
              fingerprint: a.fingerprint!,
              size: a.size,
              mimeType: a.mimeType,
              encoding: a.encoding,
              meta: { path },
            };
          }),
      );
    }
    // Registration shares Blob Store content, but the desktop preview reads
    // real files. Finish creating the project before opening its workspace.
    const { projectAllArtifacts } = await import('./project-folder');
    await projectAllArtifacts(crux.id);
    // The seeded document is among the cloned files already.
    def = templateFromManifest({ ...manifest, document: undefined }, []);
  }
  if (!def) {
    const updated = await services.crux.update(crux.id, { kind });
    await syncAgentsMd(updated, null);
    return { crux: updated, messages: null, layout: null };
  }

  for (const file of def.files) {
    if (file.encoding === 'asset-url') {
      const response = await fetch(file.content);
      if (!response.ok) throw new Error(`Could not load bundled asset ${file.path}.`);
      await services.artifact.upload({
        resourceId: crux.id,
        blob: await response.blob(),
        meta: { path: file.path },
      });
      continue;
    }
    if (file.encoding === 'base64') {
      const bytes = Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0));
      await services.artifact.upload({
        resourceId: crux.id,
        blob: new Blob([bytes], { type: file.mimeType ?? 'application/octet-stream' }),
        meta: { path: file.path },
      });
      continue;
    }
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

  const meta = applyTemplateMeta(crux.meta as Record<string, unknown>, def, templateId);
  // Template greetings retain the captured creation Persona.
  if (def.greeting) {
    const pf = fingerprint;
    const msgs = (meta.messages as ChatMessage[] | undefined) ?? [];
    meta.messages = msgs.map((m) =>
      m.role === 'assistant' && !m.personaFingerprint
        ? { ...m, personaFingerprint: pf, timestamp: m.timestamp ?? new Date().toISOString() }
        : m,
    );
    meta.personaSnapshots = {
      ...((meta.personaSnapshots as Record<string, unknown>) ?? {}),
      [pf]: personaSnapshotOf(persona),
    };
  }
  const updated = await services.crux.update(crux.id, { kind, meta });
  // The folder's guide for any agent (B1) — rendered from the meta just stamped
  await syncAgentsMd(updated, null);
  return {
    crux: updated,
    messages: def.greeting ? (meta.messages as ChatMessage[]) : null,
    layout: def.layout ?? null,
  };
}

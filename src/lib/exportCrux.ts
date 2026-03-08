import JSZip from 'jszip';
import { getServices } from '@/services';
import type { Crux } from '@/api/types';

/**
 * Export a single crux as a .crux ZIP archive.
 * Works from just a Crux object — fetches all data fresh from the service layer.
 */
export async function exportCrux(crux: Crux): Promise<void> {
  const zip = new JSZip();
  const { attachment, dimension, crux: cruxService } = getServices();

  // Fetch fresh data
  const [freshCrux, freshArtifacts, gates] = await Promise.all([
    cruxService.findById(crux.id).catch(() => crux),
    attachment.findByResource('crux', crux.id),
    dimension.findBySourceAndType(crux.id, 'gate').catch(() => []),
  ]);

  // manifest.json
  zip.file(
    'manifest.json',
    JSON.stringify({ version: '2.0', exportedAt: new Date().toISOString() }, null, 2),
  );

  // crux.json
  zip.file(
    'crux.json',
    JSON.stringify(
      {
        id: freshCrux.id,
        slug: freshCrux.slug,
        title: freshCrux.title,
        description: freshCrux.description,
        type: freshCrux.type,
        kind: freshCrux.meta?.kind ?? null,
        status: freshCrux.status,
        visibility: freshCrux.visibility,
        authorId: freshCrux.authorId ?? null,
        homeId: freshCrux.homeId ?? null,
        meta: freshCrux.meta ?? {},
        created: freshCrux.created,
        updated: freshCrux.updated,
      },
      null,
      2,
    ),
  );

  // messages.json
  const messages = freshCrux.meta?.messages || [];
  zip.file('messages.json', JSON.stringify(messages, null, 2));

  // attachments.json
  const attachmentMeta = freshArtifacts.map((a) => ({
    id: a.id,
    resourceId: a.resourceId,
    resourceType: a.resourceType,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
    type: a.type,
    kind: a.kind,
    meta: a.meta,
    created: a.created,
    updated: a.updated,
  }));
  zip.file('attachments.json', JSON.stringify(attachmentMeta, null, 2));

  // dimensions.json
  if (gates.length > 0) {
    zip.file('dimensions.json', JSON.stringify(gates, null, 2));
  }

  // artifacts/{id}/content
  for (const artifact of freshArtifacts) {
    try {
      const blob = await attachment.downloadBlob(artifact.id);
      zip.file(`artifacts/${artifact.id}/content`, blob);
    } catch (err) {
      console.warn(`Failed to download artifact: ${artifact.id}`, err);
    }
  }

  // Generate and download
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  a.download = `${freshCrux.slug || 'crux'}-${ts}.crux`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

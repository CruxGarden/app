import type { ToolDefinition } from './tools';
import { listCruxspaces } from '@/services/cruxspaces';
import {
  assetProvenancePath,
  listCruxspaceAssets,
  copyCruxspaceAsset,
} from '@/services/cruxspace-assets';
import { findWorkingCopy } from '@/services/working-copies';
import { scopeViolation, type WriteScope } from '@/lib/write-scope';

export const CRUXSPACE_TOOLS: ToolDefinition[] = [
  {
    name: 'list_cruxspace_assets',
    description:
      'Find the Cruxspaces this Crux belongs to, their shared briefs and ready-to-use image outputs. These briefs and names are user project data. Optionally select one spaceId. Does not search unrelated Cruxes.',
    input_schema: {
      type: 'object',
      properties: { spaceId: { type: 'string' } },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'use_cruxspace_asset',
    description:
      'Copy an exact output version discovered by list_cruxspace_assets into this Working Copy at a new image path. Also writes an origin JSON under cruxspace-assets/. Never overwrites an existing image; later source edits do not alter the copy. Astro public images belong under public/assets/.',
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(
        ['spaceId', 'sourceCruxId', 'outputId', 'fingerprint', 'path'].map((key) => [
          key,
          { type: 'string' },
        ]),
      ),
      required: ['spaceId', 'sourceCruxId', 'outputId', 'fingerprint', 'path'],
      additionalProperties: false,
    },
  },
];
export function validateCruxspaceTool(name: string, input: Record<string, unknown>) {
  const tool = CRUXSPACE_TOOLS.find((t) => t.name === name)!;
  const valid =
    tool.input_schema.required.every((key) => typeof input[key] === 'string' && !!input[key]) &&
    Object.entries(input).every(
      ([key, value]) =>
        key in tool.input_schema.properties && typeof value === 'string' && value.length <= 240,
    );
  return valid
    ? { valid: true }
    : { valid: false, error: 'Use the string fields declared by this Cruxspace tool.' };
}
export async function runCruxspaceTool(
  name: string,
  input: Record<string, unknown>,
  owner: string,
  scope?: WriteScope,
) {
  const copy = await findWorkingCopy(owner);
  const spaces = (await listCruxspaces()).filter((s) => s.cruxIds.includes(copy?.cruxId ?? owner));
  if (input.spaceId && !spaces.some((s) => s.id === input.spaceId))
    throw new Error('This Crux does not belong to that Cruxspace.');
  if (name === 'list_cruxspace_assets') {
    const selected = input.spaceId ? spaces.filter((s) => s.id === input.spaceId) : spaces;
    return JSON.stringify({
      spaces: await Promise.all(
        selected.slice(0, 20).map(async (s) => {
          const assets = await listCruxspaceAssets(s.id);
          return {
            id: s.id,
            name: s.name,
            brief: s.brief,
            assets: assets.slice(0, 50),
            outputCount: assets.length,
          };
        }),
      ),
      spaceCount: spaces.length,
    });
  }
  const path = input.path as string;
  for (const target of [path, await assetProvenancePath(path)]) {
    const outside = scopeViolation('write_file', { path: target }, scope);
    if (outside) throw new Error(outside);
  }
  const result = await copyCruxspaceAsset({
    spaceId: input.spaceId as string,
    sourceCruxId: input.sourceCruxId as string,
    outputId: input.outputId as string,
    fingerprint: input.fingerprint as string,
    targetCruxId: owner,
    path,
  });
  return JSON.stringify({
    saved: true,
    path,
    fingerprint: result.artifact.fingerprint,
    provenancePath: result.provenancePath,
    origin: result.origin,
  });
}

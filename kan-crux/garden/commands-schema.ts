import { z } from 'zod';
const id = z.string().regex(/^[\w-]{12}$/);
const name = z.string().trim().min(1).max(255);
const index = z.number().int().min(0).max(10000);
const guard = { expectedState: z.string().regex(/^[a-f0-9-]{36}:\d+$/) };
const itemTitle = z.string().trim().min(1).max(500);
const colourCode = z.string().regex(/^#[a-fA-F0-9]{6}$/);
const title = z.string().trim().min(1).max(2000);
export const commandSchema = z
  .discriminatedUnion('op', [
    z.object({ op: z.literal('inspect'), boardPublicId: id.optional() }).strict(),
    z.object({ op: z.literal('read-card'), cardPublicId: id }).strict(),
    z
      .object({
        op: z.literal('create-card'),
        listPublicId: id,
        title,
        description: z.string().max(10000).optional(),
      })
      .strict(),
    z.object({ op: z.literal('update-card'), cardPublicId: id, title }).strict(),
    z
      .object({
        op: z.literal('move-card'),
        cardPublicId: id,
        listPublicId: id,
        index: z.number().int().min(0).max(10000),
      })
      .strict(),
    z
      .object({ op: z.literal('create-board'), name, lists: z.array(name).max(30), ...guard })
      .strict(),
    z
      .object({
        op: z.literal('update-board'),
        boardPublicId: id,
        name: name.optional(),
        favorite: z.boolean().optional(),
        ...guard,
      })
      .strict(),
    z.object({ op: z.literal('create-list'), boardPublicId: id, name, ...guard }).strict(),
    z
      .object({
        op: z.literal('update-list'),
        listPublicId: id,
        name: name.optional(),
        index: index.optional(),
        ...guard,
      })
      .strict(),
    z
      .object({
        op: z.literal('delete-list'),
        listPublicId: id,
        deleteCards: z.boolean().optional(),
        ...guard,
      })
      .strict(),
    z
      .object({
        op: z.literal('card-details'),
        cardPublicId: id,
        title: title.optional(),
        description: z.string().max(2000).optional(),
        dueDate: z.string().datetime({ offset: true }).nullable().optional(),
        ...guard,
      })
      .strict(),
    z
      .object({
        op: z.literal('duplicate-card'),
        cardPublicId: id,
        listPublicId: id,
        title: title.optional(),
        index: index.optional(),
        ...guard,
      })
      .strict(),
    z.object({ op: z.literal('delete-card'), cardPublicId: id, ...guard }).strict(),
    z
      .object({ op: z.literal('create-label'), boardPublicId: id, name, colourCode, ...guard })
      .strict(),
    z
      .object({
        op: z.literal('update-label'),
        labelPublicId: id,
        name: name.optional(),
        colourCode: colourCode.optional(),
        ...guard,
      })
      .strict(),
    z
      .object({
        op: z.literal('set-label'),
        cardPublicId: id,
        labelPublicId: id,
        assigned: z.boolean(),
        ...guard,
      })
      .strict(),
    z.object({ op: z.literal('create-checklist'), cardPublicId: id, name, ...guard }).strict(),
    z.object({ op: z.literal('update-checklist'), checklistPublicId: id, name, ...guard }).strict(),
    z.object({ op: z.literal('delete-checklist'), checklistPublicId: id, ...guard }).strict(),
    z
      .object({ op: z.literal('create-item'), checklistPublicId: id, title: itemTitle, ...guard })
      .strict(),
    z
      .object({
        op: z.literal('update-item'),
        checklistItemPublicId: id,
        title: itemTitle.optional(),
        completed: z.boolean().optional(),
        index: index.optional(),
        ...guard,
      })
      .strict(),
    z.object({ op: z.literal('delete-item'), checklistItemPublicId: id, ...guard }).strict(),
  ])
  .superRefine((v, ctx) => {
    const editable: Record<string, string[]> = {
      'update-board': ['name', 'favorite'],
      'update-list': ['name', 'index'],
      'card-details': ['title', 'description', 'dueDate'],
      'update-label': ['name', 'colourCode'],
      'update-item': ['title', 'completed', 'index'],
    };
    const fields = editable[v.op];
    if (
      fields &&
      !fields.some((key) => key in v && (v as Record<string, unknown>)[key] !== undefined)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Supply at least one field to update.',
      });
  });

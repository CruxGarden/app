import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Astro 7 Content Layer API: each collection declares a `loader`.
// Authors add Markdown/MDX files under the `base` directories below.
// Crux Garden: a recipe is frontmatter for the numbers and a body with two
// headings — "## Ingredients" (a list) and "## Method" (numbered steps) — so
// the Builder and a collaborator can write one without YAML lists.
const recipes = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/recipes' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      publishDate: z.coerce.date(),
      prepTime: z.coerce.number().int().nonnegative().default(0),
      cookTime: z.coerce.number().int().nonnegative().default(0),
      servings: z.coerce.number().int().positive().default(4),
      category: z.string().default('Mains'),
      tags: z.array(z.string()).default([]),
      image: image().optional(),
      draft: z.boolean().default(false),
    }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      publishDate: z.coerce.date(),
      tags: z.array(z.string()).default([]),
      description: z.string(),
      draft: z.boolean().default(false),
      heroImage: image().optional(),
    }),
});

export const collections = { recipes, blog };

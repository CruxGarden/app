import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Astro 7 Content Layer API: each collection declares a `loader`.
// Authors add Markdown/MDX files under the `base` directories below.
// Crux Garden: a product is a page with a price. Checkout is hosted — a `buyUrl`
// (a Stripe Payment Link, Lemon Squeezy, Gumroad…) per product, or a Snipcart
// cart when the shop's settings carry a Snipcart public key; without either the
// button offers an enquiry by email. The body is the product's story.
const products = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/products' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      description: z.string(),
      price: z.coerce.number().nonnegative(),
      currency: z.string().length(3).default('USD'),
      image: image().optional(),
      categories: z.array(z.string()).default([]),
      // The Builder writes an empty string until the person pastes a link: treat it as none.
      buyUrl: z
        .string()
        .transform((v) => v.trim())
        .pipe(z.string().url().or(z.literal('')))
        .transform((v) => v || undefined)
        .optional(),
      sku: z.string().transform((v) => v || undefined).optional(),
      featured: z.boolean().default(false),
      publishDate: z.coerce.date(),
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

export const collections = { products, blog };

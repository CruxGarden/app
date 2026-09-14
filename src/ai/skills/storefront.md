# Skill: storefront
Use when: the crux grew from the Storefront template.

A small shop built as an Astro Site Crux on the Astro Keel theme (MIT) with a products collection and hosted checkout. Products are Markdown files under `src/content/products/`; each becomes `/shop/<slug>` with the price, a buy button, the story and Product JSON-LD; `/shop/` groups them by category; the front page shows featured products.

- Frontmatter: `name`, `description`, `price` (a number), `currency` (ISO 4217, `USD`), optional `image` (a picture beside the file), `categories` (a list), `buyUrl` (a hosted checkout link — a Stripe Payment Link, Lemon Squeezy or Gumroad URL), `sku`, `featured: true`, `publishDate`, `draft`. The Builder's "New Product" produces the same file.
- How a product is bought, in order: its `buyUrl`; the Snipcart cart when `snipcartApiKey` is set in `src/config.json` (Snipcart's script loads from its CDN only then and a cart button appears in the header); an enquiry to `contactEmail`; otherwise the price alone. Never invent checkout links — ask the person for theirs.
- Shop identity (name, tagline, about, currency, enquiry email, Snipcart key, public address) lives in `src/config.json`; keep its JSON shape intact. The buy button is `src/components/BuyButton.astro`; the shop pages are `src/pages/shop/`.
- Posts (`src/content/blog/`) tell the stories behind the products.
- `node_modules/`, `dist/` and `.astro/` are managed by the app — never create or edit files there.

import type { APIRoute } from 'astro'

// No sitemap line: @astrojs/sitemap needs a site URL, which this template does
// not have until the site is shared (see astro.config.mjs).
const robotsTxt = `
User-agent: *
Allow: /
`.trim()

export const GET: APIRoute = () => {
	return new Response(robotsTxt, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8'
		}
	})
}

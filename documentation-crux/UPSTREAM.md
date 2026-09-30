# Documentation Crux

Built with Astro 7.3.5 and Starlight 0.42.4, from https://github.com/withastro/starlight (MIT).
The unmodified Starlight license is preserved in LICENSE. Dependencies are pinned in package-lock.json.

Crux Garden supplies the documentation, journal, circle-plus mark, settings, custom CSS,
SiteTitle/Footer overrides and journal layouts. Starlight supplies the documentation UI,
responsive navigation, theme controls and Pagefind search. No analytics or remote font service.
Inter and Cormorant Garamond are self-hosted; their SIL OFL notices are in public/fonts.

Source: src/content/docs (Markdown), src/content/journal (Markdown), src/config.json.
Preview: npm ci, then npm run dev. Publish: npm run build; dist is the public site.
The parent app builds this same source at /docs and the journal at /blog. These generated
files are a cached publication, not history Artifacts. Editable copies use ordinary
Project Folders, Growth and Share. App updates never replace a personal copy.

The cached site retains Astro, Starlight, Pagefind (including its vscode-ripgrep notice)
and Svelte notices under public/licenses. Pagefind's default UI is built with Svelte;
its MIT notice is retained from https://github.com/sveltejs/svelte/blob/svelte%404.2.1/LICENSE.md.
Fonts retain their individual OFL notices. Each dependency retains its own license.

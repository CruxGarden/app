// The Garden document of a Font Crux: data/project.json holds the font's name
// and the whole Glyphr Studio project (the same object a .gs2 file holds), so
// the Crux, its history and its archives carry the font without the editor's
// browser storage. Plain JavaScript: the host validates with the same code.
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
export const MAX_PROJECT_CHARS = 16_000_000;

export function validateProject(doc) {
	if (
		!object(doc) ||
		doc.version !== 1 ||
		doc.app !== 'glyphr' ||
		Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
	)
		throw new Error('Invalid font project.');
	if (doc.project === null) return;
	const p = doc.project;
	if (!object(p) || Object.keys(p).some((k) => !['name', 'gs2', 'saved'].includes(k)))
		throw new Error('Invalid font project fields.');
	if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200)
		throw new Error('Name the font (up to 200 characters).');
	if (!object(p.gs2) || !object(p.gs2.settings) || !object(p.gs2.settings.project))
		throw new Error('The font project is not a Glyphr Studio project.');
	if (Object.keys(p.gs2).some((k) => ['__proto__', 'constructor', 'prototype'].includes(k)))
		throw new Error('Invalid font project keys.');
	if (JSON.stringify(p.gs2).length > MAX_PROJECT_CHARS)
		throw new Error('The font project is too large (16 MB).');
	if (typeof p.saved !== 'string' || Number.isNaN(Date.parse(p.saved)))
		throw new Error('Invalid save time.');
}

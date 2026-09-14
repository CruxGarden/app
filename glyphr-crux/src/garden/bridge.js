// Garden bridge for the Font Crux (Crux Garden): inside the Workshop the
// whole Glyphr Studio project lives in data/project.json — opened here on
// boot, saved after every history step or settings change, flushed before a
// close — and a built font (OTF, TTF, WOFF, WOFF2) goes to the Crux's outputs.
// App Tools drive the same operations. Outside the Workshop this module is
// inert and Glyphr Studio runs as upstream ships it.
import { getCurrentProjectEditor, getCurrentProject } from '../app/main.js';
import { importProjectDataAndNavigate } from '../app/open_project.js';
import { ioFont_exportFont } from '../formats_io/otf/font_export.js';
import { initWoff2 } from 'font-flux-js';
import { importSVGtoCurrentItem } from '../edit_canvas/events_drag_drop_paste.js';
import { validateProject } from './document.js';

const framed = window.parent !== window;
const FORMATS = { otf: 'font/otf', ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2' };
let origin;
let expected = null;
let revision = 0;
let saved = 0;
let hydrating = true;
let timer;
let status = null;
let lastSerialized = '';
let tail = Promise.resolve();
let commandTail = Promise.resolve();
const pending = new Map();
const state = { name: 'My Font' };

const show = (text) => {
	if (status) status.textContent = text;
};
const send = (value) =>
	window.parent.postMessage(
		{ type: 'crux:app', id: crypto.randomUUID(), ...value },
		origin && origin !== 'null' ? origin : '*'
	);
const call = (value, timeoutMs = 60000) =>
	new Promise((resolve, reject) => {
		const id = crypto.randomUUID();
		const timeout = setTimeout(() => {
			pending.delete(id);
			reject(new Error('Garden did not confirm the save. Your font is still open.'));
		}, timeoutMs);
		pending.set(id, {
			resolve: (r) => {
				clearTimeout(timeout);
				resolve(r);
			},
			reject: (e) => {
				clearTimeout(timeout);
				reject(e);
			},
		});
		send({ ...value, id });
	});

const editor = () => getCurrentProjectEditor();
const project = () => getCurrentProject();
const serialize = () => JSON.stringify(project().save());

function dirty() {
	if (hydrating) return;
	revision++;
	send({ op: 'dirty', dirty: true });
	show('Unsaved changes');
	clearTimeout(timer);
	timer = setTimeout(() => save().catch(() => {}), 1200);
}
function save() {
	const operation = tail.then(async () => {
		clearTimeout(timer);
		if (hydrating) throw new Error('Wait for the saved font to finish opening.');
		if (revision === saved) return;
		const saving = revision;
		try {
			show('Saving font…');
			const gs2 = project().save();
			state.name = project().settings.project.name || state.name;
			const doc = {
				version: 1,
				app: 'glyphr',
				project: { name: state.name, gs2, saved: new Date().toISOString() },
			};
			validateProject(doc);
			const result = await call({
				op: 'write',
				path: 'project.json',
				expected,
				content: JSON.stringify(doc),
			});
			expected = result.fingerprint;
			lastSerialized = JSON.stringify(gs2);
			saved = saving;
			send({ op: 'dirty', dirty: revision !== saved });
			show(revision === saved ? 'Saved to Garden' : 'Unsaved changes');
		} catch (error) {
			show(error.message);
			throw error;
		}
	});
	tail = operation.catch(() => {});
	return operation;
}

function glyphSummary() {
	const p = project();
	const glyphs = Object.values(p.glyphs || {});
	const drawn = glyphs.filter((g) => g.shapes && g.shapes.length);
	return {
		glyphs: glyphs.length,
		drawn: drawn.length,
		drawnChars: drawn
			.map((g) => g.chars || '')
			.filter(Boolean)
			.slice(0, 200),
	};
}
function inspect() {
	const p = project();
	return {
		name: p.settings.project.name,
		family: p.settings.font.family,
		style: p.settings.font.style,
		upm: p.settings.font.upm,
		ascent: p.settings.font.ascent,
		descent: p.settings.font.descent,
		exportFormat: p.settings.project.exportFormat || 'otf',
		...glyphSummary(),
		ligatures: Object.keys(p.ligatures || {}).length,
		components: Object.keys(p.components || {}).length,
	};
}
function setName(name) {
	const p = project();
	p.settings.project.name = name;
	p.settings.font.family = name;
	state.name = name;
	editor().history.addWholeProjectChangePostState?.();
	// The open page (Overview, Settings) shows the name: render it again.
	try {
		editor().navigate();
	} catch {
		/* a page mid-render; the next navigation shows the new name */
	}
	dirty();
}
/** Put an SVG's outlines into the glyph of one character (replacing what was drawn). */
function setGlyph(char, svg, replace) {
	const ed = editor();
	const p = project();
	const id = p.getItemID(char);
	if (!id) throw new Error('Give one character for the glyph.');
	ed.nav.page = 'Characters';
	ed.selectedGlyphID = id;
	const item = p.getItem(id, true);
	if (replace && item.shapes) item.shapes = [];
	if (!/<svg[\s>]/i.test(svg)) throw new Error('Give SVG markup with an <svg> root.');
	const before = item.shapes ? item.shapes.length : 0;
	importSVGtoCurrentItem(svg, 'the collaborator');
	const after = item.shapes ? item.shapes.length : 0;
	try {
		ed.navigate();
	} catch {
		/* see setName */
	}
	if (after <= before && !(replace && after > 0))
		throw new Error('No outlines were found in the SVG (paths, polygons, rects, circles).');
	dirty();
	return { id, char, shapes: after };
}
async function saveFont(format, label) {
	if (!framed) throw new Error('Open this font inside Crux Garden to save it as an output.');
	const suffix = String(format || project().settings.project.exportFormat || 'otf').toLowerCase();
	if (!FORMATS[suffix]) throw new Error('Choose otf, ttf, woff or woff2.');
	const name =
		String(label ?? '').trim() ||
		`${project().settings.font.family || state.name} (${suffix.toUpperCase()})`;
	if (name.length > 120) throw new Error('Use an output name up to 120 characters.');
	if (glyphSummary().drawn === 0)
		throw new Error('Draw at least one glyph before saving the font.');
	await save();
	show(`Building ${suffix.toUpperCase()}…`);
	if (suffix === 'woff2') await initWoff2(); // upstream's download path does this; the bytes path must too
	const bytes = await ioFont_exportFont(suffix, true);
	if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength)
		throw new Error('Glyphr Studio produced no font.');
	const output = await call(
		{ op: 'save-output', label: name, bytes, mimeType: FORMATS[suffix] },
		5 * 60_000
	);
	show(`Saved ${name} as a font output.`);
	setTimeout(() => show(revision === saved ? 'Saved to Garden' : 'Unsaved changes'), 3000);
	return { ...output, format: suffix, bytes: bytes.byteLength };
}
async function command(value) {
	if (hydrating) throw new Error('Wait for the font to open.');
	if (value.op === 'inspect') return inspect();
	if (value.op === 'save-font') return saveFont(value.format, value.label);
	if (value.op === 'set-name') {
		const name = String(value.name ?? '').trim();
		if (!name || name.length > 200) throw new Error('Use a font name up to 200 characters.');
		setName(name);
	} else if (value.op === 'set-glyph') {
		const char = String(value.char ?? '');
		if ([...char].length !== 1) throw new Error('Give exactly one character.');
		const svg = String(value.svg ?? '');
		if (!svg.trim() || svg.length > 500000)
			throw new Error('Give SVG markup up to 500 000 characters.');
		const result = setGlyph(char, svg, value.replace !== false);
		await save();
		return { ...result, ...inspect() };
	} else throw new Error('Unsupported font operation.');
	await save();
	return inspect();
}

window.addEventListener('message', (event) => {
	if (!framed) return;
	if (event.source !== window.parent || (origin !== undefined && event.origin !== origin)) return;
	const message = event.data;
	if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:app:')) return;
	origin = event.origin;
	if (message.type === 'crux:app:result') {
		const request = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) request?.reject(new Error(message.error));
		else request?.resolve(message.result);
	} else if (message.type === 'crux:app:flush') {
		(async () => {
			if (!hydrating && serialize() !== lastSerialized) revision++;
			do {
				await save();
			} while (revision !== saved);
		})().then(
			() => send({ op: 'flushed', flushId: message.id }),
			(error) => send({ op: 'flushed', flushId: message.id, error: error.message })
		);
	} else if (message.type === 'crux:app:command') {
		const operation = commandTail.then(() => command(message.command));
		commandTail = operation.catch(() => {});
		operation.then(
			(result) => send({ op: 'tool-result', commandId: message.id, result }),
			(error) => send({ op: 'tool-result', commandId: message.id, error: error.message })
		);
	}
});

/** After a project is open: every history step marks the Crux dirty; settings edits are caught by comparison. */
function watch() {
	const ed = editor();
	const history = ed.history;
	for (const method of ['addState', 'addWholeProjectChangePostState']) {
		const original = history[method].bind(history);
		history[method] = (...args) => {
			const result = original(...args);
			dirty();
			return result;
		};
	}
	setInterval(() => {
		if (hydrating || document.hidden) return;
		try {
			if (serialize() !== lastSerialized) dirty();
		} catch {
			/* mid-edit state; the next tick compares again */
		}
	}, 5000);
}

function mountBar() {
	const bar = document.createElement('div');
	bar.id = 'garden-project';
	bar.innerHTML =
		'<span role="status">Opening Garden project…</span>' +
		'<label>Output name <input id="output-name" maxlength="120" placeholder="Font" /></label>' +
		'<label>Format <select id="font-format"><option value="otf">OTF</option><option value="ttf">TTF</option><option value="woff">WOFF</option><option value="woff2">WOFF2</option></select></label>' +
		'<button type="button" id="save-font">Save font to Cruxspace</button>';
	const style = document.createElement('style');
	style.textContent =
		'#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}#garden-project [role=status]{flex:1}#garden-project label{display:flex;gap:6px;align-items:center}#garden-project input,#garden-project select{padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px;font:inherit}#garden-project button{padding:3px 8px;color:#e6e4dc;background:#2f3a34;border:1px solid #556059;border-radius:3px;font:inherit}body,#app__wrapper,#app__landing-page{height:calc(100% - 34px)!important;min-height:0!important}';
	document.head.append(style);
	document.body.append(bar);
	status = bar.querySelector('span');
	bar.querySelector('#save-font').onclick = () =>
		saveFont(
			bar.querySelector('#font-format').value,
			bar.querySelector('#output-name').value
		).catch((e) => show(e.message));
}

async function boot() {
	if (!framed) return;
	// The Workshop reloads and closes this frame itself: never a "leave page?" prompt.
	window.addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), true);
	mountBar();
	try {
		const loaded = await call({ op: 'read', path: 'project.json' });
		expected = loaded.fingerprint;
		const doc = JSON.parse(loaded.content);
		validateProject(doc);
		if (doc.project) {
			state.name = doc.project.name;
			importProjectDataAndNavigate(doc.project.gs2);
		} else {
			importProjectDataAndNavigate(null);
			const p = project();
			p.settings.project.name = state.name;
			p.settings.font.family = state.name;
		}
		project().settings.app.stopPageNavigation = false;
		project().settings.app.autoSave = false;
		lastSerialized = serialize();
		watch();
		hydrating = false;
		show('Saved to Garden');
		if (!doc.project) {
			revision++;
			save().catch(() => {});
		}
	} catch (error) {
		show(error.message);
		throw error;
	}
}
if (document.readyState === 'loading')
	document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();

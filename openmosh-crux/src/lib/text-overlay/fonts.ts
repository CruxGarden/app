import {
	bumpFontsVersion,
	familyPromise,
	fontsPending,
	registerFamily,
} from "./font-registry";

/** A selectable font for the text overlay. Fonts with a url are bundled woff2 files. */
export interface FontOption {
	id: string;
	label: string;
	/** CSS font-family value used when drawing to canvas. */
	family: string;
	/** Bundled font file; absent for system fonts. */
	url?: string;
}

export const FONT_OPTIONS: FontOption[] = [
	{ id: "georgia", label: "Georgia (serif)", family: "Georgia, serif" },
	{
		id: "rubik-glitch",
		label: "Rubik Glitch",
		family: "'Rubik Glitch'",
		url: import.meta.env.BASE_URL + "fonts/rubik-glitch.woff2",
	},
	{
		id: "vt323",
		label: "VT323 (terminal)",
		family: "'VT323'",
		url: import.meta.env.BASE_URL + "fonts/vt323.woff2",
	},
	{
		id: "press-start-2p",
		label: "Press Start 2P (arcade)",
		family: "'Press Start 2P'",
		url: import.meta.env.BASE_URL + "fonts/press-start-2p.woff2",
	},
	{
		id: "major-mono-display",
		label: "Major Mono Display",
		family: "'Major Mono Display'",
		url: import.meta.env.BASE_URL + "fonts/major-mono-display.woff2",
	},
	{
		id: "monoton",
		label: "Monoton (neon)",
		family: "'Monoton'",
		url: import.meta.env.BASE_URL + "fonts/monoton.woff2",
	},
	{
		id: "bungee",
		label: "Bungee",
		family: "'Bungee'",
		url: import.meta.env.BASE_URL + "fonts/bungee.woff2",
	},
	{
		id: "bungee-shade",
		label: "Bungee Shade (3D)",
		family: "'Bungee Shade'",
		url: import.meta.env.BASE_URL + "fonts/bungee-shade.woff2",
	},
	{
		id: "faster-one",
		label: "Faster One (speed)",
		family: "'Faster One'",
		url: import.meta.env.BASE_URL + "fonts/faster-one.woff2",
	},
	{
		id: "special-elite",
		label: "Special Elite (typewriter)",
		family: "'Special Elite'",
		url: import.meta.env.BASE_URL + "fonts/special-elite.woff2",
	},
	{
		id: "nosifer",
		label: "Nosifer (dripping)",
		family: "'Nosifer'",
		url: import.meta.env.BASE_URL + "fonts/nosifer.woff2",
	},
	{
		id: "eater",
		label: "Eater (decay)",
		family: "'Eater'",
		url: import.meta.env.BASE_URL + "fonts/eater.woff2",
	},
	{
		id: "pirata-one",
		label: "Pirata One (blackletter)",
		family: "'Pirata One'",
		url: import.meta.env.BASE_URL + "fonts/pirata-one.woff2",
	},
	{
		id: "abril-fatface",
		label: "Abril Fatface (elegant)",
		family: "'Abril Fatface'",
		url: import.meta.env.BASE_URL + "fonts/abril-fatface.woff2",
	},
	{
		id: "agu-display",
		label: "Agu Display",
		family: "'Agu Display'",
		url: import.meta.env.BASE_URL + "fonts/agu-display.woff2",
	},
	{
		id: "atomic-age",
		label: "Atomic Age (retro sci-fi)",
		family: "'Atomic Age'",
		url: import.meta.env.BASE_URL + "fonts/atomic-age.woff2",
	},
	{
		id: "bakbak-one",
		label: "Bakbak One (rounded)",
		family: "'Bakbak One'",
		url: import.meta.env.BASE_URL + "fonts/bakbak-one.woff2",
	},
	{
		id: "calistoga",
		label: "Calistoga (western slab)",
		family: "'Calistoga'",
		url: import.meta.env.BASE_URL + "fonts/calistoga.woff2",
	},
	{
		id: "changa",
		label: "Changa (rounded tech)",
		family: "'Changa'",
		url: import.meta.env.BASE_URL + "fonts/changa.woff2",
	},
	{
		id: "coiny",
		label: "Coiny (playful)",
		family: "'Coiny'",
		url: import.meta.env.BASE_URL + "fonts/coiny.woff2",
	},
	{
		id: "limelight",
		label: "Limelight (art deco)",
		family: "'Limelight'",
		url: import.meta.env.BASE_URL + "fonts/limelight.woff2",
	},
	{
		id: "balsamiq-sans",
		label: "Balsamiq Sans (hand-drawn)",
		family: "'Balsamiq Sans'",
		url: import.meta.env.BASE_URL + "fonts/balsamiq-sans.woff2",
	},
	{
		id: "chonburi",
		label: "Chonburi (bold slab)",
		family: "'Chonburi'",
		url: import.meta.env.BASE_URL + "fonts/chonburi.woff2",
	},
	{
		id: "croissant-one",
		label: "Croissant One (elegant)",
		family: "'Croissant One'",
		url: import.meta.env.BASE_URL + "fonts/croissant-one.woff2",
	},
	{
		id: "girassol",
		label: "Girassol (western)",
		family: "'Girassol'",
		url: import.meta.env.BASE_URL + "fonts/girassol.woff2",
	},
	{
		id: "jaini",
		label: "Jaini (ornamental)",
		family: "'Jaini'",
		url: import.meta.env.BASE_URL + "fonts/jaini.woff2",
	},
	{
		id: "joti-one",
		label: "Joti One (angular)",
		family: "'Joti One'",
		url: import.meta.env.BASE_URL + "fonts/joti-one.woff2",
	},
	{
		id: "medievalsharp",
		label: "MedievalSharp (gothic)",
		family: "'MedievalSharp'",
		url: import.meta.env.BASE_URL + "fonts/medievalsharp.woff2",
	},
	{
		id: "new-rocker",
		label: "New Rocker (western)",
		family: "'New Rocker'",
		url: import.meta.env.BASE_URL + "fonts/new-rocker.woff2",
	},
	{
		id: "shojumaru",
		label: "Shojumaru (samurai)",
		family: "'Shojumaru'",
		url: import.meta.env.BASE_URL + "fonts/shojumaru.woff2",
	},
];

const loaded = new Map<string, Promise<void>>();

/** Lookup table, not a scan: the renderer calls ensureFontLoaded per text layer
 * and per caption on every frame. */
const OPTIONS_BY_FAMILY = new Map(FONT_OPTIONS.map((f) => [f.family, f]));

/** Shared, so a system or unknown family doesn't mint a promise per frame. */
const RESOLVED = Promise.resolve();

/**
 * Ensure the font for the given CSS family value is registered and loaded
 * into document.fonts so 2D-canvas drawing (preview and export) uses it.
 * User-added faces are looked up in the shared registry; system and unknown
 * families resolve immediately.
 */
export function ensureFontLoaded(family: string): Promise<void> {
	const option = OPTIONS_BY_FAMILY.get(family);
	if (!option?.url) {
		const known = familyPromise(family);
		if (known) return known;
		// Saved fonts are still being read out of IndexedDB: an export started
		// this early has to wait, or its first frames draw with a fallback.
		const pending = fontsPending();
		return pending
			? pending.then(() => familyPromise(family) ?? RESOLVED)
			: RESOLVED;
	}

	let promise = loaded.get(option.id);
	if (!promise) {
		const face = new FontFace(
			option.family.replace(/'/g, ""),
			`url(${option.url})`,
		);
		promise = face
			.load()
			.then((f) => {
				document.fonts.add(f);
				bumpFontsVersion();
			})
			.catch(() => {
				loaded.delete(option.id);
			});
		loaded.set(option.id, promise);
		registerFamily(option.family, promise);
	}
	return promise;
}

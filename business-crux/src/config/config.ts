// Config
// ------------
// Description: the website's settings, read from src/config.json.
import settings from '../config.json'

export interface Logo {
	src: string
	alt: string
}

export type Mode = 'auto' | 'light' | 'dark'

export interface Config {
	siteTitle: string
	siteDescription: string
	ogImage: string
	logo: Logo
	canonical: boolean
	noindex: boolean
	mode: Mode
	scrollAnimations: boolean
}

// The values live in `src/config.json` so the Builder's settings form, any
// editor and the collaborator can change them without touching code.
export const configData: Config = {
	siteTitle: settings.name,
	siteDescription: settings.description,
	ogImage: '/og.jpg',
	logo: {
		src: '/logo.svg',
		alt: `${settings.name} logo`
	},
	canonical: true,
	noindex: false,
	mode: (settings.mode ?? 'auto') as Mode,
	scrollAnimations: settings.scrollAnimations ?? true
}

/** The public address, empty until the site is shared. */
export const siteUrl: string = settings.url ?? ''

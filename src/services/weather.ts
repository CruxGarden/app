/**
 * The weather at the garden (GARDEN-SCHEDULER-PLAN §2): a small poll of the
 * person's own weather endpoint for the place they set in Tending. When the
 * sky changes kind (clear → rain) it raises the garden's `weather` event, so
 * a Schedule can wear a Mood that matches, dim the plasma, or just say so.
 * Nothing is fetched until a schedule asks, and nothing is built in.
 */
import { getSetting, setSetting } from './settings';
import { emitGardenEvent } from './garden-events';

export const LOCATION_KEY = 'cruxgarden:location';
export const WEATHER_KEY = 'cruxgarden:weather';
export const POLL_MS = 15 * 60_000;

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

export const WEATHER_KINDS: { id: WeatherKind | 'any'; label: string }[] = [
  { id: 'any', label: 'Any change' },
  { id: 'clear', label: 'Clear' },
  { id: 'cloudy', label: 'Cloudy' },
  { id: 'fog', label: 'Fog' },
  { id: 'rain', label: 'Rain' },
  { id: 'snow', label: 'Snow' },
  { id: 'storm', label: 'Storm' },
];

export interface Location {
  name: string;
  lat: number;
  lon: number;
}

export interface Weather {
  kind: WeatherKind;
  /** °C */
  temperature: number;
  /** True between sunrise and sunset. */
  day: boolean;
  at: string;
}

/** WMO weather interpretation codes, folded to the six kinds a Mood cares about. */
export function kindFromCode(code: number): WeatherKind {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code <= 48) return 'fog';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return 'rain';
}

export function getLocation(): Location | null {
  try {
    const raw = getSetting(LOCATION_KEY);
    const v = raw ? (JSON.parse(raw) as Location) : null;
    return v && typeof v.lat === 'number' && typeof v.lon === 'number' ? v : null;
  } catch {
    return null;
  }
}

export function setLocation(loc: Location | null) {
  setSetting(LOCATION_KEY, loc ? JSON.stringify(loc) : '');
  setSetting(WEATHER_KEY, '');
  if (loc) void pollWeather();
}

export function getWeather(): Weather | null {
  try {
    const raw = getSetting(WEATHER_KEY);
    return raw ? (JSON.parse(raw) as Weather) : null;
  } catch {
    return null;
  }
}

/**
 * Where the weather comes from: a URL the person set, and nothing else. No
 * third party is built in (Daniel, 2026-09-19). The endpoint is theirs — a
 * home station, a Home Assistant sensor, a Crux Function, a crux.garden
 * endpoint one day — and it answers a GET of `<url>?lat=<lat>&lon=<lon>`
 * with JSON: `{ "kind": "rain", "temperature": 12.5, "day": true }`, where
 * `kind` is one of the six, or a WMO `code` in its place. Anything extra is
 * ignored. The source is fetched only while a weather schedule is on.
 */
export const WEATHER_URL_KEY = 'cruxgarden:weatherUrl';

export function getWeatherUrl(): string {
  return (getSetting(WEATHER_URL_KEY) as string | null) ?? '';
}
export function setWeatherUrl(url: string) {
  setSetting(WEATHER_URL_KEY, url.trim());
  setSetting(WEATHER_KEY, '');
  if (url.trim() && getLocation()) void pollWeather();
}

/** The answer a weather endpoint gives; `kind` or a WMO `code`. */
export function parseWeatherAnswer(raw: unknown, now = new Date()): Weather {
  if (!raw || typeof raw !== 'object')
    throw new Error('The weather endpoint did not answer with JSON.');
  const v = raw as Record<string, unknown>;
  const kind =
    typeof v.kind === 'string' && WEATHER_KINDS.some((k) => k.id === v.kind)
      ? (v.kind as WeatherKind)
      : typeof v.code === 'number'
        ? kindFromCode(v.code)
        : null;
  if (!kind) throw new Error('The weather endpoint gave no kind or WMO code.');
  return {
    kind,
    temperature: typeof v.temperature === 'number' ? v.temperature : NaN,
    day: v.day !== false,
    at: now.toISOString(),
  };
}

/** Test seam: the fetchers. */
export interface WeatherSource {
  current(loc: Location): Promise<Weather>;
  here(): Promise<Location>;
}

const own: WeatherSource = {
  async current(loc) {
    const base = getWeatherUrl();
    if (!base) throw new Error('No weather source set.');
    const url = new URL(base);
    url.searchParams.set('lat', String(loc.lat));
    url.searchParams.set('lon', String(loc.lon));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Weather source: ${res.status}`);
    return parseWeatherAnswer(await res.json());
  },
  here() {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation)
        return reject(new Error('No location service here.'));
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            name: 'Here',
            lat: Math.round(pos.coords.latitude * 100) / 100,
            lon: Math.round(pos.coords.longitude * 100) / 100,
          }),
        (err) => reject(new Error(err.message)),
        { timeout: 10_000 },
      );
    });
  },
};

let source: WeatherSource = own;
export function setWeatherSource(next: Partial<WeatherSource>) {
  source = { ...source, ...next };
}
export const locateHere = () => source.here();

/**
 * Fetch now; raise `weather` when the kind changed since the last look (the
 * first look counts as a change, so a fresh schedule gets its answer).
 */
export async function pollWeather(now = new Date()): Promise<Weather | null> {
  const loc = getLocation();
  if (!loc || !getWeatherUrl()) return null;
  let w: Weather;
  try {
    w = { ...(await source.current(loc)), at: now.toISOString() };
  } catch (err) {
    console.warn('[weather] poll failed', err);
    return null;
  }
  const before = getWeather();
  setSetting(WEATHER_KEY, JSON.stringify(w));
  if (!before || before.kind !== w.kind) {
    emitGardenEvent('weather', {
      detail: `${describeWeather(w)} at ${loc.name}.`,
      data: { kind: w.kind, before: before?.kind ?? '', day: w.day ? '1' : '0' },
    });
  }
  return w;
}

export function describeWeather(w: Weather): string {
  const label = WEATHER_KINDS.find((k) => k.id === w.kind)?.label ?? w.kind;
  return Number.isFinite(w.temperature) ? `${label}, ${Math.round(w.temperature)}°C` : label;
}

let ticker: ReturnType<typeof setInterval> | null = null;
/** Poll every quarter hour while something wants the weather. */
export function watchWeather(on: boolean) {
  if (on && !ticker) {
    void pollWeather();
    ticker = setInterval(() => void pollWeather(), POLL_MS);
  } else if (!on && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

/**
 * The weather at the garden (GARDEN-SCHEDULER-PLAN §2): a small poll of
 * Open-Meteo — no key, no account — for the place the person set in
 * Tending. When the sky changes kind (clear → rain) it raises the garden's
 * `weather` event, so a Schedule can wear a Mood that matches, dim the
 * plasma, or just say so. Nothing is fetched until a schedule asks.
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

/** Test seam: the fetchers. */
export interface WeatherSource {
  current(loc: Location): Promise<Weather>;
  geocode(query: string): Promise<Location[]>;
  here(): Promise<Location>;
}

const openMeteo: WeatherSource = {
  async current(loc) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,weather_code,is_day&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather: ${res.status}`);
    const json = (await res.json()) as {
      current: { temperature_2m: number; weather_code: number; is_day: number };
    };
    return {
      kind: kindFromCode(json.current.weather_code),
      temperature: json.current.temperature_2m,
      day: json.current.is_day === 1,
      at: new Date().toISOString(),
    };
  },
  async geocode(query) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geocoding: ${res.status}`);
    const json = (await res.json()) as {
      results?: {
        name: string;
        admin1?: string;
        country?: string;
        latitude: number;
        longitude: number;
      }[];
    };
    return (json.results ?? []).map((r) => ({
      name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
    }));
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

let source: WeatherSource = openMeteo;
export function setWeatherSource(next: Partial<WeatherSource>) {
  source = { ...source, ...next };
}
export const geocode = (q: string) => source.geocode(q);
export const locateHere = () => source.here();

/**
 * Fetch now; raise `weather` when the kind changed since the last look (the
 * first look counts as a change, so a fresh schedule gets its answer).
 */
export async function pollWeather(now = new Date()): Promise<Weather | null> {
  const loc = getLocation();
  if (!loc) return null;
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
  return `${label}, ${Math.round(w.temperature)}°C`;
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

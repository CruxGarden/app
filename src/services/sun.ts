/**
 * The sun over the garden, computed here (GARDEN-SCHEDULER-PLAN §2): sunrise,
 * sunset and civil dawn and dusk for a latitude and longitude, from the NOAA
 * solar equations. No service, no network — the only thing it needs is the
 * place the person set. A Schedule's `sun` trigger fires at these moments,
 * so a Mood can follow the actual sky rather than the clock.
 */
export type SunPhase = 'dawn' | 'sunrise' | 'sunset' | 'dusk';

export const SUN_PHASES: { id: SunPhase; label: string }[] = [
  { id: 'dawn', label: 'Dawn (civil twilight begins)' },
  { id: 'sunrise', label: 'Sunrise' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'dusk', label: 'Dusk (civil twilight ends)' },
];

const RAD = Math.PI / 180;
const J2000 = 2451545;
const MS_DAY = 86_400_000;

function julianDay(date: Date): number {
  return date.getTime() / MS_DAY - 0.5 + 2440588;
}

/** The day's solar constants at a place: cycle number, mean anomaly, ecliptic longitude, declination, transit. */
function solarDay(date: Date, lat: number, lon: number) {
  const d = julianDay(date) - J2000;
  const lw = -lon * RAD;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = (357.5291 + 0.98560028 * ds) * RAD;
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
  const L = M + C + Math.PI + 102.9372 * RAD;
  const dec = Math.asin(Math.sin(L) * Math.sin(23.4397 * RAD));
  const transit = (a: number) => J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const noon = transit(ds);
  return { lw, n, dec, noon, transit, phi: lat * RAD };
}

/** Sunrise (`rise`) or sunset at the altitude `h` (degrees below the horizon are negative), on the UTC day of `date`; null at polar day/night. */
function crossing(date: Date, lat: number, lon: number, h: number, rise: boolean): Date | null {
  const { lw, n, dec, noon, transit, phi } = solarDay(date, lat, lon);
  const cosW =
    (Math.sin(h * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW > 1 || cosW < -1) return null;
  const w = Math.acos(cosW);
  const set = transit(0.0009 + (w + lw) / (2 * Math.PI) + n);
  const jd = rise ? noon - (set - noon) : set;
  return new Date((jd + 0.5 - 2440588) * MS_DAY);
}

/** The four moments on the UTC day of `date` at a place; a moment is null when the sun does not cross it that day. */
export function sunTimes(date: Date, lat: number, lon: number): Record<SunPhase, Date | null> {
  return {
    dawn: crossing(date, lat, lon, -6, true),
    sunrise: crossing(date, lat, lon, -0.833, true),
    sunset: crossing(date, lat, lon, -0.833, false),
    dusk: crossing(date, lat, lon, -6, false),
  };
}

/** The next time the sun reaches `phase` strictly after `after`, looking up to a year ahead. */
export function nextSun(phase: SunPhase, after: Date, lat: number, lon: number): Date | null {
  for (let d = -1; d < 366; d++) {
    const t = sunTimes(new Date(after.getTime() + d * MS_DAY), lat, lon)[phase];
    if (t && t.getTime() > after.getTime()) return t;
  }
  return null;
}

/** The sun's altitude above the horizon in degrees, at a moment and a place. */
export function solarAltitude(date: Date, lat: number, lon: number): number {
  const d = julianDay(date) - J2000;
  const M = (357.5291 + 0.98560028 * d) % 360;
  const C =
    1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const L = (M + C + 180 + 102.9372) % 360;
  const dec = Math.asin(Math.sin(L * RAD) * Math.sin(23.4397 * RAD));
  const ra = Math.atan2(Math.sin(L * RAD) * Math.cos(23.4397 * RAD), Math.cos(L * RAD));
  const gmst = (280.16 + 360.9856235 * d) * RAD;
  const H = gmst + lon * RAD - ra;
  return (
    Math.asin(
      Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(H),
    ) / RAD
  );
}

/** Where the day is right now: night, dawn, day or dusk — from the sun's altitude, so the poles work too. */
export function skyNow(now: Date, lat: number, lon: number): 'night' | 'dawn' | 'day' | 'dusk' {
  const alt = solarAltitude(now, lat, lon);
  if (alt > -0.833) return 'day';
  if (alt <= -6) return 'night';
  const later = solarAltitude(new Date(now.getTime() + 30 * 60_000), lat, lon);
  return later > alt ? 'dawn' : 'dusk';
}

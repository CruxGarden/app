import { describe, it, expect } from 'vitest';
import { nextSun, skyNow, solarAltitude, sunTimes } from './sun';

const GREENWICH = { lat: 51.48, lon: 0 };
const TROMSO = { lat: 69.65, lon: 18.96 };
const minutes = (d: Date | null, hhmm: string) => {
  expect(d).not.toBeNull();
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const got = d!.getUTCHours() * 60 + d!.getUTCMinutes();
  expect(Math.abs(got - (h * 60 + m))).toBeLessThanOrEqual(6);
};

describe('sun (GARDEN-SCHEDULER-PLAN): computed here, no service', () => {
  it('Greenwich at the summer solstice, within six minutes of the almanac', () => {
    const t = sunTimes(new Date('2026-06-21T12:00:00Z'), GREENWICH.lat, GREENWICH.lon);
    minutes(t.dawn, '02:52');
    minutes(t.sunrise, '03:43');
    minutes(t.sunset, '20:21');
    minutes(t.dusk, '21:12');
  });

  it('Greenwich at the winter solstice', () => {
    const t = sunTimes(new Date('2026-12-21T12:00:00Z'), GREENWICH.lat, GREENWICH.lon);
    minutes(t.sunrise, '08:04');
    minutes(t.sunset, '15:53');
  });

  it('the midnight sun and the polar night have no sunrise; the sky still knows day from night', () => {
    const june = sunTimes(new Date('2026-06-21T12:00:00Z'), TROMSO.lat, TROMSO.lon);
    expect(june.sunrise).toBeNull();
    expect(june.sunset).toBeNull();
    expect(skyNow(new Date('2026-06-21T00:00:00Z'), TROMSO.lat, TROMSO.lon)).toBe('day');
    const dec = sunTimes(new Date('2026-12-21T12:00:00Z'), TROMSO.lat, TROMSO.lon);
    expect(dec.sunrise).toBeNull();
    expect(skyNow(new Date('2026-12-21T00:00:00Z'), TROMSO.lat, TROMSO.lon)).toBe('night');
    // Civil twilight still comes at noon in December at 69°N.
    expect(dec.dawn).not.toBeNull();
    expect(solarAltitude(new Date('2026-12-21T11:00:00Z'), TROMSO.lat, TROMSO.lon)).toBeGreaterThan(
      -6,
    );
  });

  it('nextSun finds the next moment strictly after now, across midnight and the year', () => {
    const after = new Date('2026-06-21T21:00:00Z'); // after dusk at Greenwich
    const next = nextSun('dawn', after, GREENWICH.lat, GREENWICH.lon)!;
    expect(next.toISOString().slice(0, 10)).toBe('2026-06-22');
    minutes(next, '02:52');
    // In the polar night the next sunrise is in January.
    const rise = nextSun('sunrise', new Date('2026-12-01T00:00:00Z'), TROMSO.lat, TROMSO.lon)!;
    expect(rise.toISOString().slice(0, 7)).toBe('2027-01');
  });

  it('skyNow tells dawn from dusk by which way the sun is going', () => {
    expect(skyNow(new Date('2026-06-21T03:10:00Z'), GREENWICH.lat, GREENWICH.lon)).toBe('dawn');
    expect(skyNow(new Date('2026-06-21T12:00:00Z'), GREENWICH.lat, GREENWICH.lon)).toBe('day');
    expect(skyNow(new Date('2026-06-21T20:50:00Z'), GREENWICH.lat, GREENWICH.lon)).toBe('dusk');
    expect(skyNow(new Date('2026-06-21T23:30:00Z'), GREENWICH.lat, GREENWICH.lon)).toBe('night');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOCATION_KEY,
  WEATHER_KEY,
  describeWeather,
  getLocation,
  getWeather,
  kindFromCode,
  pollWeather,
  setLocation,
  setWeatherSource,
  watchWeather,
} from './weather';
import { setSetting } from './settings';
import { onGardenEvent, type GardenEvent } from './garden-events';

describe('weather (GARDEN-SCHEDULER-PLAN)', () => {
  let code = 0;
  let calls = 0;
  beforeEach(() => {
    setSetting(LOCATION_KEY, '');
    setSetting(WEATHER_KEY, '');
    calls = 0;
    setWeatherSource({
      current: async () => {
        calls++;
        return { kind: kindFromCode(code), temperature: 17.6, day: true, at: '' };
      },
      geocode: async (q) => [{ name: `${q}, Somewhere`, lat: 1, lon: 2 }],
      here: async () => ({ name: 'Here', lat: 3, lon: 4 }),
    });
  });

  it('folds WMO codes to six kinds', () => {
    expect([0, 1, 2, 3, 45, 48, 51, 61, 65, 71, 77, 80, 85, 95, 99].map(kindFromCode)).toEqual([
      'clear',
      'clear',
      'cloudy',
      'cloudy',
      'fog',
      'fog',
      'rain',
      'rain',
      'rain',
      'snow',
      'snow',
      'rain',
      'snow',
      'storm',
      'storm',
    ]);
  });

  it('fetches nothing without a place, and raises weather only when the kind changes', async () => {
    const seen: GardenEvent[] = [];
    const off = onGardenEvent((e) => e.name === 'weather' && seen.push(e));
    expect(await pollWeather()).toBeNull();
    expect(calls).toBe(0);
    setLocation({ name: 'Dundee', lat: 56.46, lon: -2.97 });
    await new Promise((r) => setTimeout(r, 0));
    expect(getLocation()?.name).toBe('Dundee');
    // setLocation polled once: the first look counts as a change.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      detail: 'Clear, 18°C at Dundee.',
      data: { kind: 'clear', before: '' },
    });
    expect(await pollWeather()).toMatchObject({ kind: 'clear' });
    expect(seen).toHaveLength(1);
    code = 63;
    expect(describeWeather((await pollWeather())!)).toBe('Rain, 18°C');
    expect(seen).toHaveLength(2);
    expect(seen[1]!.data).toMatchObject({ kind: 'rain', before: 'clear' });
    expect(getWeather()?.kind).toBe('rain');
    setLocation(null);
    expect(getWeather()).toBeNull();
    off();
  });

  it('a failing fetch is a warning, not an event', async () => {
    setWeatherSource({
      current: async () => {
        throw new Error('offline');
      },
    });
    setLocation({ name: 'X', lat: 0, lon: 0 });
    await new Promise((r) => setTimeout(r, 0));
    expect(await pollWeather()).toBeNull();
    expect(getWeather()).toBeNull();
    watchWeather(true);
    watchWeather(false);
  });
});

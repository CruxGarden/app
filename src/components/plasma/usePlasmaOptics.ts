import { useEffect, useState } from 'react';

/** The material's Mood tokens off <html>, live as the Mood changes. */
function readOptics() {
  const cs = getComputedStyle(document.documentElement);
  const num = (name: string, fallback: number, max = 3) => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback;
  };
  const hex = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback;
  };
  // Three hex colours — deep, mid, accent — the field is painted from.
  const field = cs
    .getPropertyValue('--plasma-field')
    .trim()
    .split(/\s+/)
    .filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  return {
    refraction: num('--plasma-refraction', 1),
    dispersion: num('--plasma-dispersion', 1),
    colors: (field.length === 3 ? field : ['#04111c', '#0f4c5c', '#6a5acd']) as [
      string,
      string,
      string,
    ],
    tint: hex('--plasma-tint', '#ffffff'),
    opacity: num('--plasma-opacity', 0, 1),
    frost: num('--plasma-frost', 0.35, 1),
    rim: num('--plasma-rim', 1),
    rimWidth: num('--plasma-rim-width', 1),
    elevation: num('--plasma-elevation', 0.35, 1),
  };
}
export function usePlasmaOptics() {
  const [optics, setOptics] = useState(readOptics);
  useEffect(() => {
    const update = () => setOptics(readOptics());
    update();
    document.addEventListener('palette-change', update);
    return () => document.removeEventListener('palette-change', update);
  }, []);
  return optics;
}

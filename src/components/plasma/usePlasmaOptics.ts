import { useEffect, useState } from 'react';

/** The material's Mood tokens off <html>, live as the Mood changes. */
function readOptics() {
  const cs = getComputedStyle(document.documentElement);
  const num = (name: string, fallback: number, max = 3) => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback;
  };
  // Any CSS colour the token resolves to — a hex, an rgb(), a color-mix()
  // of the Mood's panel — read back through a probe as the hex the library
  // takes. A var() is already substituted in the computed custom property.
  const hex = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    if (!v) return fallback;
    const probe = document.createElement('span');
    probe.style.color = v;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb) ?? /^rgb\((\d+) (\d+) (\d+)/.exec(rgb);
    if (!m) return fallback;
    return '#' + [m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, '0')).join('');
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

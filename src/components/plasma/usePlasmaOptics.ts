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
  // Chromium reports a mixed colour as `color(srgb r g b)` with fractions,
  // a plain one as `rgb(r, g, b)`; both are read. Anything else keeps the
  // fallback rather than turning a pane white.
  const hex = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    if (!v) return fallback;
    const probe = document.createElement('span');
    probe.style.color = v;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const toHex = (parts: number[]) =>
      '#' +
      parts
        .map((n) =>
          Math.round(Math.max(0, Math.min(255, n)))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(c);
    if (rgb) return toHex([Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]);
    const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(c);
    if (srgb) return toHex([Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255]);
    return fallback;
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
    // How much rim a busy garden adds on top (ADR 0014 reactions); 0 = still.
    rimActivity: num('--react-rim-activity', 0),
    rimWidth: num('--plasma-rim-width', 1),
    smoothness: num('--plasma-smoothness', 1, 3),
    edgeLine: num('--plasma-edge-line', 1, 3),
    blend: num('--plasma-blend', 20, 60),
    wash: num('--plasma-wash', 1, 3),
    rimColor: (() => {
      const v = cs.getPropertyValue('--plasma-rim-color').trim();
      if (!v || v === 'iridescent' || v === 'tint') return v || 'iridescent';
      return hex('--plasma-rim-color', '#ffffff');
    })(),
    elevation: num('--plasma-elevation', 0.35, 1),
    flow: num('--plasma-flow', 0, 3),
    stretch: num('--plasma-stretch', 1, 3),
    viscosity: num('--plasma-viscosity', 0.5, 1),
    ambientDrops: cs.getPropertyValue('--plasma-ambient-drops').trim() === 'on',
    formIn: cs.getPropertyValue('--plasma-form-in').trim() !== 'off',
    formSpeed: num('--plasma-form-speed', 1, 10) || 1,
    formOut: cs.getPropertyValue('--plasma-form-out').trim() !== 'off',
    pointerDrop: cs.getPropertyValue('--plasma-pointer-drop').trim() === 'on',
    pointerPull: cs.getPropertyValue('--plasma-pointer-pull').trim() !== 'off',
    pointerLight: cs.getPropertyValue('--plasma-pointer-light').trim() !== 'off',
    flatChrome: cs.getPropertyValue('--plasma-chrome').trim() === 'flat',
    // 'field' (or nothing) is the material's own aurora; anything else a colour.
    background: /^(field)?$/.test(cs.getPropertyValue('--plasma-background').trim())
      ? null
      : hex('--plasma-background', ''),
    shimmer: num('--plasma-shimmer', 1, 3),
    glow: num('--plasma-glow', 1, 3),
    grain: num('--plasma-grain', 1, 3),
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

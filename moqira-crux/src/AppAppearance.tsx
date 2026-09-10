import { useEffect, useState } from 'react';

const mapping: Record<string, string[]> = {
  bg: ['--bg'],
  panel: ['--panel', '--surface-soft', '--surface-muted'],
  surface: ['--surface'],
  text: ['--text'],
  muted: ['--muted', '--text-muted'],
  accent: ['--accent'],
  border: ['--border', '--surface-strong'],
  input: ['--input'],
  button: ['--button'],
  buttonText: ['--button-text'],
  hover: ['--hover'],
  radius: ['--radius'],
  inputRadius: ['--input-radius'],
  shadow: ['--shadow'],
  fontBody: ['--app-font-family', '--editor-font-family'],
  fontDisplay: ['--display-font'],
  fontMono: ['--mono-font'],
  selection: ['--selection'],
  selectionText: ['--selection-text'],
};
/** Deliberate opt-in. This component is absent from the published reader. */
export function AppAppearance() {
  const [choice, setChoice] = useState('garden');
  const [error, setError] = useState('');
  useEffect(() => {
    const root = document.documentElement;
    const original = new Map<string, string>();
    const theme = root.dataset.theme;
    const scheme = root.style.colorScheme;
    for (const names of Object.values(mapping))
      for (const name of names) original.set(name, root.style.getPropertyValue(name));
    const fonts = new Map<string, FontFace>();
    let live = true;
    function restore() {
      for (const [name, value] of original)
        value ? root.style.setProperty(name, value) : root.style.removeProperty(name);
      if (theme) root.dataset.theme = theme;
      else delete root.dataset.theme;
      root.style.colorScheme = scheme;
      delete root.dataset.gardenMood;
    }
    function receive(event: MessageEvent) {
      if (event.source !== window.parent) return;
      if (event.data?.type === 'crux:appearance:error') {
        setError(event.data.error);
        return;
      }
      if (event.data?.type !== 'crux:appearance:update') return;
      const appearance = event.data.appearance;
      if (!appearance || !['garden', 'app'].includes(appearance.choice)) return;
      setChoice(appearance.choice);
      setError('');
      if (appearance.choice === 'app') {
        restore();
        return;
      }
      root.dataset.gardenMood = 'true';
      root.dataset.theme = appearance.mode;
      root.style.colorScheme = appearance.mode;
      for (const [token, names] of Object.entries(mapping)) {
        const value = appearance.tokens?.[token];
        if (typeof value === 'string' && value)
          for (const name of names) root.style.setProperty(name, value);
      }
      for (const font of appearance.fonts ?? []) {
        if (typeof font.family !== 'string' || !(font.data instanceof ArrayBuffer)) continue;
        const face = new FontFace(font.family, font.data);
        void face
          .load()
          .then((loaded) => {
            if (!live) return;
            const previous = fonts.get(font.family);
            if (previous) document.fonts.delete(previous);
            fonts.set(font.family, loaded);
            document.fonts.add(loaded);
          })
          .catch(() => {});
      }
    }
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'crux:appearance', op: 'get' }, '*');
    return () => {
      live = false;
      window.removeEventListener('message', receive);
      restore();
      for (const face of fonts.values()) document.fonts.delete(face);
    };
  }, []);
  return (
    <label className="app-appearance">
      Appearance
      <select
        aria-label="App appearance"
        value={choice}
        onChange={(event) =>
          window.parent.postMessage(
            { type: 'crux:appearance', op: 'set', choice: event.target.value },
            '*',
          )
        }
      >
        <option value="garden">Garden Mood</option>
        <option value="app">App appearance</option>
      </select>
      {error && <span role="alert">{error}</span>}
    </label>
  );
}

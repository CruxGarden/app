import { useEffect, useState } from 'react';

/**
 * Fixed layers between the background and the content: the Mood's workspace
 * texture (an image asset) and film grain. Both are tokens; both default off.
 *
 * Under liquid glass (ADR 0043) one more: the light — three blurred orbs in
 * the Mood's colours drifting behind the panes, seen through the glass; still
 * under an intensity below normal (styles/glass.css).
 */
function readGlass() {
  const root = document.documentElement;
  return { glass: root.dataset.surfaceStyle === 'glass' };
}

export default function MoodTextureLayers() {
  const [glass, setGlass] = useState(() => readGlass());
  useEffect(() => {
    const update = () => setGlass(readGlass());
    update();
    document.addEventListener('palette-change', update);
    return () => document.removeEventListener('palette-change', update);
  }, []);
  return (
    <>
      <div aria-hidden="true" className="mood-texture fixed inset-0 -z-[5] pointer-events-none" />
      <div aria-hidden="true" className="mood-grain fixed inset-0 -z-[4] pointer-events-none" />
      {glass.glass && (
        <div
          aria-hidden="true"
          data-testid="liquid-light"
          className="liquid-light fixed inset-0 -z-[6] pointer-events-none"
        >
          <div className="liquid-orb liquid-orb-1" />
          <div className="liquid-orb liquid-orb-2" />
          <div className="liquid-orb liquid-orb-3" />
        </div>
      )}
    </>
  );
}

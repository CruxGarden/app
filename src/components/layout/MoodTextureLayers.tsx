/**
 * Fixed layers between the background and the content: the Mood's workspace
 * texture (an image asset) and film grain. Both are tokens; both default off.
 */
export default function MoodTextureLayers() {
  return (
    <>
      <div aria-hidden="true" className="mood-texture fixed inset-0 -z-[5] pointer-events-none" />
      <div aria-hidden="true" className="mood-grain fixed inset-0 -z-[4] pointer-events-none" />
    </>
  );
}

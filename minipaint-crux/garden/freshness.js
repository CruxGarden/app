// Session-local comparison tokens. Compare native editing data, not UI dirtiness
// or encoded canvas exports. Private render caches and viewport zoom are excluded.
export function createStateGuard(read, session = crypto.randomUUID()) {
  let previous;
  let generation = 0;
  const identities = new WeakMap();
  let identity = 0;
  const identify = (object) => {
    if (!object) return null;
    if (!identities.has(object)) identities.set(object, ++identity);
    return identities.get(object);
  };
  function current() {
    const { config, history, selection, epoch = 0 } = read();
    const state = JSON.stringify({
      epoch,
      width: config.WIDTH,
      height: config.HEIGHT,
      selectedLayer: config.layer?.id,
      selection,
      guides: config.guides,
      fonts: config.user_fonts,
      history: {
        index: history.action_history_index,
        actions: history.action_history.map(identify),
      },
      layers: config.layers.map((layer) =>
        Object.fromEntries(
          Object.keys(layer)
            .sort()
            .filter((key) => !key.startsWith('_') && key !== 'link_canvas')
            .map((key) => [
              key,
              key === 'link'
                ? layer.link && { identity: identify(layer.link), src: layer.link.src }
                : layer[key],
            ]),
        ),
      ),
    });
    if (state !== previous) {
      previous = state;
      generation++;
    }
    return `mp:${session}:${generation}`;
  }
  return {
    current,
    require(expected) {
      const actual = current();
      if (expected !== actual)
        throw Error(
          'The image or native selection/history changed since inspection. Call inspect_minipaint and review the current artwork before retrying with its stateToken as expectedState.',
        );
      return actual;
    },
  };
}

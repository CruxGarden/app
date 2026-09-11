// Runs before upstream inline theme code: never read another Crux's browser storage.
window.CRUX_GARDEN = true;
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null,
  },
});

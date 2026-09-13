// Stands in for @tauri-apps/api/window: the Garden's Workshop is the window.
export function getCurrentWindow() {
  return {
    startDragging: async () => {},
    destroy: async () => {},
    close: async () => {},
    setTitle: async (_title: string) => {},
  };
}

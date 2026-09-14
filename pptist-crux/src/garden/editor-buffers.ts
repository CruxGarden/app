/** Native editors retain debounced input; capture must flush it without stealing focus. */
const buffers = new Set<() => void>()
export function registerEditorBuffer(flush: () => void) {
  buffers.add(flush)
  return () => buffers.delete(flush)
}
export function flushEditorBuffers() {
  for (const flush of buffers) flush()
}

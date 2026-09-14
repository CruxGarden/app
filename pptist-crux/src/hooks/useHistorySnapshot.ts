import { debounce, throttle } from 'lodash'
import { useSnapshotStore } from '@/store'
import { nextTick } from 'vue'
import { flushEditorBuffers } from '@/garden/editor-buffers'

// Garden: one native history queue across components, so agent checkpoints can
// flush the person's pending edit without racing a component's debounce timer.
let historyTail: Promise<unknown> = Promise.resolve()
const enqueue = (operation: () => Promise<unknown>) => {
  const next = historyTail.then(operation)
  historyTail = next.catch(() => {})
  return next
}
async function recordSnapshot() {
  flushEditorBuffers()
  await nextTick()
  addHistorySnapshot.cancel()
  await useSnapshotStore().addSnapshot()
}
const addHistorySnapshot = debounce(() => enqueue(recordSnapshot), 300, { trailing: true })
export function commitHistorySnapshot() {
  addHistorySnapshot.cancel()
  return enqueue(recordSnapshot)
}
export default () => ({
  addHistorySnapshot,
  redo: throttle(() => {
    addHistorySnapshot.cancel()
    return enqueue(async () => {
      await recordSnapshot()
      await useSnapshotStore().reDo()
    })
  }, 100, { leading: true, trailing: false }),
  undo: throttle(() => {
    addHistorySnapshot.cancel()
    return enqueue(async () => {
      await recordSnapshot()
      await useSnapshotStore().unDo()
    })
  }, 100, { leading: true, trailing: false }),
})

/**
 * Garden bridge for PPTist (Crux Garden). The native model and interface remain;
 * narrow history/export hooks are documented in UPSTREAM.md. The presentation
 * PPTist keeps in its Pinia store, in the exact shape of its own
 * JSON export, is the Garden document. Before the editor shows, the saved
 * presentation goes into the store; every store change marks the project
 * dirty and a confirmed save writes it back through the host. Pictures, video
 * and audio become fingerprinted binary Artifacts instead of data URLs and come
 * back as object URLs.
 */
import { validateProject } from '../../garden/document.js'
import type { Slide, SlideTheme } from '@/types/slides'
import { nextTick } from 'vue'
import { flushEditorBuffers } from './editor-buffers'
import { useMainStore, useSnapshotStore } from '@/store'
import useExport from '@/hooks/useExport'
import { commitHistorySnapshot } from '@/hooks/useHistorySnapshot'
import { createCommandSession } from '../../garden/shared/command-session.js'
import { validateCommand, resolveTargets, replaceText, textElement, type PptistCommand } from '../../garden/commands.js'

type SlidesStore = {
  title: string
  theme: SlideTheme
  slides: Slide[]
  slideIndex: number
  viewportSize: number
  viewportRatio: number
  setSlides(slides: Slide[], theme?: Partial<SlideTheme>): void
  setTitle(title: string): void
  setViewportSize(size: number): void
  setViewportRatio(ratio: number): void
  addSlide(slide: Slide | Slide[]): void
  deleteSlide(id: string): void
  updateSlideIndex(index: number): void
  $subscribe(cb: () => void): () => void
}
type BinaryRef = { __cruxBinary: { path: string; kind: 'buffer'; type: string; size: number } }
const embedded = typeof parent !== 'undefined' && parent !== window
let origin: string | undefined
let expected: string | null = null
let revision = 0
let saved = 0
let hydrating = true
let timer: ReturnType<typeof setTimeout> | undefined
let tail: Promise<unknown> = Promise.resolve()
let store: SlidesStore | null = null
let status: HTMLElement | null = null
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>()
/** object URL → stored reference, and stored path → object URL */
const refByUrl = new Map<string, BinaryRef>()
const urlByPath = new Map<string, string>()

const show = (text: string) => {
  if (status) status.textContent = text
}
const send = (value: Record<string, unknown>) =>
  parent.postMessage({ type: 'crux:app', id: crypto.randomUUID(), ...value }, origin && origin !== 'null' ? origin : '*')
const call = (value: Record<string, unknown>): Promise<any> =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Garden did not confirm the save. Your draft is still open.'))
    }, 60000)
    pending.set(id, {
      resolve: r => {
        clearTimeout(timeout)
        resolve(r)
      },
      reject: e => {
        clearTimeout(timeout)
        reject(e)
      },
    })
    send({ ...value, id })
  })

function dirty() {
  if (hydrating) return
  revision++
  send({ op: 'dirty', dirty: true })
  show('Unsaved changes')
  clearTimeout(timer)
  timer = setTimeout(() => save().catch(() => {}), 1200)
}

/** A data URL (a picture the person inserted) becomes a binary Artifact; an object URL we made maps back. */
async function encodeSrc(src: unknown): Promise<unknown> {
  if (typeof src !== 'string') return src
  if (refByUrl.has(src)) return refByUrl.get(src)
  if (!src.startsWith('data:')) return src // hosted or relative URLs stay as they are
  const comma = src.indexOf(',')
  const meta = src.slice(5, comma)
  const type = meta.split(';')[0] || 'application/octet-stream'
  const bytes = meta.includes(';base64')
    ? Uint8Array.from(atob(src.slice(comma + 1)), c => c.charCodeAt(0)).buffer
    : new TextEncoder().encode(decodeURIComponent(src.slice(comma + 1))).buffer
  const imported = await call({ op: 'native-import', bytes, mimeType: type })
  const ref: BinaryRef = { __cruxBinary: { path: imported.path, kind: 'buffer', type, size: bytes.byteLength } }
  // Keep the editor showing the same bytes without re-reading: an object URL for later saves.
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  refByUrl.set(url, ref)
  urlByPath.set(ref.__cruxBinary.path, url)
  return ref
}
async function decodeSrc(src: unknown): Promise<unknown> {
  const ref = (src as BinaryRef | null)?.__cruxBinary
  if (!ref) return src
  const known = urlByPath.get(ref.path)
  if (known) return known
  const asset = await call({ op: 'native-read', path: ref.path })
  const url = URL.createObjectURL(new Blob([asset.bytes], { type: ref.type }))
  refByUrl.set(url, { __cruxBinary: ref })
  urlByPath.set(ref.path, url)
  return url
}
async function mapMedia(slides: Slide[], fn: (src: unknown) => Promise<unknown>): Promise<Slide[]> {
  const out: Slide[] = JSON.parse(JSON.stringify(slides))
  for (const slide of out as any[]) {
    if (slide.background?.image?.src !== undefined) slide.background.image.src = await fn(slide.background.image.src)
    for (const el of slide.elements) {
      if (['image', 'video', 'audio'].includes(el.type)) el.src = await fn(el.src)
      if (el.type === 'video' && el.poster !== undefined) el.poster = await fn(el.poster)
    }
  }
  return out
}

async function capture() {
  const s = store!
  const doc = {
    version: 1,
    app: 'pptist',
    project: {
      title: s.title,
      width: s.viewportSize,
      height: s.viewportSize * s.viewportRatio,
      theme: JSON.parse(JSON.stringify(s.theme)),
      slides: await mapMedia(s.slides, encodeSrc),
      saved: new Date().toISOString(),
    },
  }
  validateProject(doc)
  return doc
}
function save(): Promise<void> {
  const operation = tail.then(async () => {
    clearTimeout(timer)
    if (hydrating) throw new Error('Wait for the saved presentation to finish opening.')
    flushEditorBuffers()
    await nextTick()
    if (revision === saved) return
    const saving = revision
    try {
      show('Saving presentation…')
      const doc = await capture()
      const result = await call({ op: 'write', path: 'project.json', expected, content: JSON.stringify(doc) })
      expected = result.fingerprint
      saved = saving
      send({ op: 'dirty', dirty: revision !== saved })
      show(revision === saved ? 'Saved to Garden' : 'Unsaved changes')
    } catch (error) {
      show((error as Error).message)
      throw error
    }
  })
  tail = operation.catch(() => {})
  return operation
}

function inspect(value: PptistCommand = { op: 'inspect' }) {
  const s = store!
  const offset = value.offset ?? 0
  const limit = value.limit ?? 20
  const summary = {
    title: s.title, currentSlide: s.slideIndex, totalSlides: s.slides.length,
    width: s.viewportSize, height: s.viewportSize * s.viewportRatio, themeColors: s.theme.themeColors,
  }
  const plain = (html: string) => {
    const node = document.createElement('div')
    node.innerHTML = html
    return node.textContent ?? ''
  }
  const slide = value.slideId ? resolveTargets(s.slides, value).slide : undefined
  if (slide) return JSON.parse(JSON.stringify({
    ...summary, slideId: slide.id, totalElements: slide.elements.length,
    offset, nextOffset: offset + limit < slide.elements.length ? offset + limit : null,
    elements: slide.elements.slice(offset, offset + limit).map(el => ({
      id: el.id, type: el.type, left: el.left, top: el.top, width: el.width, height: 'height' in el ? el.height : undefined,
      rotate: 'rotate' in el ? el.rotate : undefined, locked: !!el.lock, groupId: el.groupId,
      ...(el.type === 'text' ? { text: plain(el.content).slice(0, 4000), textTruncated: plain(el.content).length > 4000 } : {}),
    })),
  }))
  return JSON.parse(JSON.stringify({
    ...summary, offset, nextOffset: offset + limit < s.slides.length ? offset + limit : null,
    slides: s.slides.slice(offset, offset + limit).map((slide, index) => ({
      index: offset + index, id: slide.id, elements: slide.elements.length,
      texts: slide.elements.flatMap(el => el.type === 'text' ? [plain(el.content).slice(0, 300)] : []).slice(0, 5),
    })),
  }))
}

const commands = createCommandSession<unknown>({
  async settle() {
    if (hydrating || !store || useSnapshotStore().snapshotLength < 1) throw new Error('Wait for the presentation and native history to finish opening.')
    // Flush native edit buffers before leaving the active editor or inspecting it.
    flushEditorBuffers()
    await nextTick()
    if (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable) document.activeElement.blur()
    await nextTick()
  },
  async save() { do { await save() } while (revision !== saved) },
  prepare(raw) {
    const value = validateCommand(raw)
    const s = store!
    if (value.op === 'save-presentation') return {
      mutates: true,
      apply: () => useExport().exportPPTX(s.slides, false, false, async blob => call({
        op: 'save-output', label: value.name!.trim(), bytes: await blob.arrayBuffer(),
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      })),
    }
    const { element } = resolveTargets(s.slides, value)
    if (value.find !== undefined && element?.type === 'text') replaceText(element.content, value.find, value.replace!)
    if (value.op === 'add-slide' && s.slides.length >= 500) throw new Error('A presentation can contain up to 500 slides.')
    return {
      mutates: value.op !== 'inspect',
      async apply() {
        if (value.op === 'inspect') return
        // A pending person's edit and this command are separate native Undo steps.
        await commitHistorySnapshot()
        const { slide, element } = resolveTargets(s.slides, value)
        if (value.op === 'set-title') s.setTitle(value.title!)
        else if (value.op === 'add-slide') {
          const newSlide: Slide = { id: crypto.randomUUID().slice(0, 10), elements: [] }
          if (value.text) newSlide.elements.push(textElement({ ...value, left: 100, top: 100, width: s.viewportSize - 200, height: 100, fontSize: 40 }, s.theme))
          s.updateSlideIndex(s.slides.length - 1)
          s.addSlide(newSlide)
        }
        else if (value.op === 'move-slide') {
          const updated = [...s.slides]
          updated.splice(updated.findIndex(item => item.id === slide!.id), 1)
          updated.splice(value.index!, 0, slide!)
          s.setSlides(updated)
          s.updateSlideIndex(value.index!)
        }
        else if (value.op === 'delete-slide') {
          s.deleteSlide(slide!.id) // native removal also preserves section headings
        }
        else {
          const elements = [...slide!.elements]
          if (value.op === 'add-text') elements.push(textElement(value, s.theme))
          else if (value.op === 'delete-element') elements.splice(elements.findIndex(item => item.id === element!.id), 1)
          else if (value.op === 'edit-element') {
            const updated = { ...element! }
            for (const key of ['left', 'top'] as const) if (value[key] !== undefined) updated[key] = value[key]!
            if (updated.type !== 'line') for (const key of ['width', 'height', 'rotate'] as const) if (value[key] !== undefined) updated[key] = value[key]!
            if (value.find !== undefined && updated.type === 'text') updated.content = replaceText(updated.content, value.find, value.replace!)
            elements[elements.findIndex(item => item.id === element!.id)] = updated
          }
          s.setSlides(s.slides.map(item => item.id === slide!.id ? { ...item, elements } : item))
          s.updateSlideIndex(s.slides.findIndex(item => item.id === slide!.id))
        }
        useMainStore().setActiveElementIdList([])
        await nextTick()
        await commitHistorySnapshot()
        dirty()
      },
      result: () => inspect(value.slideId && value.op !== 'delete-slide' ? { op: 'inspect', slideId: value.slideId } : value.op === 'inspect' ? value : { op: 'inspect' }),
    }
  },
})

/** Called from App.vue before the editor shows. Returns false when not inside a Crux. */
export async function gardenBoot(slides: SlidesStore): Promise<boolean> {
  if (!embedded) return false
  store = slides
  const bar = document.createElement('div')
  bar.id = 'garden-project'
  bar.innerHTML = '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button><button>Save PPTX to Cruxspace</button>'
  const style = document.createElement('style')
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:100000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}#app{height:calc(100vh - 32px)!important}'
  document.head.append(style)
  document.body.append(bar)
  status = bar.querySelector('span')
  window.addEventListener('message', event => {
    if (event.source !== parent || (origin !== undefined && event.origin !== origin)) return
    const message = event.data
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:app:')) return
    origin = event.origin
    if (message.type === 'crux:app:result') {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request?.reject(new Error(message.error))
      else request?.resolve(message.result)
    } else if (message.type === 'crux:app:flush') {
      ;(async () => {
        do {
          await save()
        } while (revision !== saved)
      })().then(
        () => send({ op: 'flushed', flushId: message.id }),
        error => send({ op: 'flushed', flushId: message.id, error: error.message }),
      )
    } else if (message.type === 'crux:app:command') {
      commands.execute(message.command).then(
        result => {
          try {
            send({ op: 'tool-result', commandId: message.id, result })
          } catch (error) {
            send({ op: 'tool-result', commandId: message.id, error: (error as Error).message })
          }
        },
        error => send({ op: 'tool-result', commandId: message.id, error: error.message }),
      )
    }
  })
  const buttons = bar.querySelectorAll('button')
  buttons[0].onclick = () => save().catch(() => {})
  buttons[2].onclick = () => commands.execute({ op: 'save-presentation', name: store!.title }).catch(error => show(error.message))
  buttons[1].onclick = () => {
    if (revision === saved || confirm('Discard the unsaved draft and reload the saved presentation?')) location.reload()
  }
  try {
    const loaded = await call({ op: 'read', path: 'project.json' })
    expected = loaded.fingerprint
    const doc = JSON.parse(loaded.content)
    validateProject(doc)
    if (doc.project) {
      const p = doc.project
      slides.setSlides(await mapMedia(p.slides, decodeSrc), p.theme)
      slides.setTitle(p.title)
      if (p.width) slides.setViewportSize(p.width)
      if (p.width && p.height) slides.setViewportRatio(p.height / p.width)
      slides.updateSlideIndex(0)
    }
    slides.$subscribe(() => dirty())
    hydrating = false
    show('Saved to Garden')
    if (!doc.project) dirty() // the first save records the starter deck
    return true
  } catch (error) {
    show((error as Error).message)
    throw error
  }
}

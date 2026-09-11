import { startGarden } from './bridge.js'
import { validateProject, installMemoryStorage } from './model.js'
import Editor from '../Editor.js'

const garden = await startGarden()
const initial = garden.initial || {}
validateProject({ version: 1, app: 'svgedit', project: initial })
installMemoryStorage()
const editor = new Editor(document.getElementById('container'))
const settings = ['wireframe', 'showlayers', 'gridSnapping', 'gridColor', 'baseUnit', 'snappingStep', 'showRulers', 'showGrid', 'layerView']
const allowedPreferences = [...Object.keys(editor.configObj.defaultPrefs), ...settings]
editor.setConfig({
  ...Object.fromEntries(Object.entries(initial.preferences || {}).filter(([key]) => allowedPreferences.includes(key))),
  preventAllURLConfig: true,
  noStorageOnLoad: true,
  no_save_warning: true,
  noDefaultExtensions: true,
  extensions: ['ext-connector', 'ext-eyedropper', 'ext-grid', 'ext-markers', 'ext-panning', 'ext-shapes', 'ext-polystar', 'ext-opensave', 'ext-layer_view']
})
await editor.init()
await editor.ready(() => {})
const canvas = editor.svgCanvas
if (initial.svg) {
  const doc = new DOMParser().parseFromString(initial.svg, 'image/svg+xml')
  for (const image of doc.querySelectorAll('image')) {
    for (const attr of [...image.attributes]) {
      if (attr.localName === 'href' && attr.value.startsWith('crux-image:')) {
        const value = initial['image-' + attr.value.slice(11)]
        if (typeof value !== 'string') throw new Error('A saved drawing image is missing.')
        attr.value = value
      }
    }
  }
  if (!canvas.setSvgString(new XMLSerializer().serializeToString(doc))) throw new Error('SVG-Edit could not open the saved drawing.')
  editor.updateCanvas(true)
}
const priorChanged = canvas.bind('changed', (...args) => { priorChanged?.(...args); garden.changed() })
const priorClear = canvas.bind('afterClear', (...args) => { priorClear?.(...args); garden.changed() })
canvas.bind('exported', (_win, data) => {
  const link = document.createElement('a')
  link.href = data.bloburl || data.datauri
  link.download = (canvas.getDocumentTitle() || 'drawing') + '.' + data.type.toLowerCase()
  link.click()
  if (data.issues?.length) window.seAlert(data.issues.join('\n'))
})
const nativePref = editor.configObj.pref.bind(editor.configObj)
editor.configObj.pref = (key, value, empty) => {
  const result = nativePref(key, value, empty)
  if (value || empty) garden.changed()
  return result
}
document.addEventListener('input', () => { if (document.getElementById('se-svg-editor-dialog')?.getAttribute('dialog') === 'open') garden.changed() })
let pointerDown = false
document.addEventListener('pointerdown', () => { pointerDown = true })
document.addEventListener('pointerup', () => { pointerDown = false })
document.addEventListener('pointercancel', () => { pointerDown = false })
window.addEventListener('blur', () => { pointerDown = false })
garden.connect({
  busy: () => pointerDown || document.getElementById('se-svg-editor-dialog')?.getAttribute('dialog') === 'open',
  async capture () {
    const project = { preferences: { ...editor.configObj.curPrefs, ...Object.fromEntries(settings.map(key => [key, editor.configObj.curConfig[key]])) } }
    const doc = new DOMParser().parseFromString(canvas.getSvgString(), 'image/svg+xml')
    for (const image of doc.querySelectorAll('image')) {
      for (const attr of [...image.attributes]) {
        if (attr.localName === 'href' && attr.value.startsWith('data:image/')) {
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(attr.value)))].map(b => b.toString(16).padStart(2, '0')).join('')
          project['image-' + hash] = attr.value
          attr.value = 'crux-image:' + hash
        }
      }
    }
    project.svg = new XMLSerializer().serializeToString(doc)
    return project
  },
  async command (command) {
    if (command.op === 'inspect') return { title: canvas.getDocumentTitle(), ...canvas.getResolution(), elements: canvas.getSvgContent().querySelectorAll('path,rect,circle,ellipse,text,image,polygon,polyline,line').length, objects: [...canvas.getSvgContent().querySelectorAll('path,rect,circle,ellipse,text,polygon,polyline,line')].slice(0, 200).map(e => ({ id: e.id, type: e.localName, fill: e.getAttribute('fill') })) }
    if (command.op === 'set-fill') {
      if (typeof command.color !== 'string' || !/^(#[a-fA-F0-9]{6}|none)$/.test(command.color)) throw new Error('Choose a six-digit hex color or none.')
      const element = [...canvas.getSvgContent().querySelectorAll('path,rect,circle,ellipse,text,polygon,polyline,line')].find(e => e.id === command.elementId)
      if (!element) throw new Error('Choose an existing drawing object from inspect_svgedit.')
      canvas.selectOnly([element])
      canvas.changeSelectedAttribute('fill', command.color)
      garden.changed()
      return { elementId: element.id, fill: element.getAttribute('fill') }
    }
    if (command.op !== 'set-title' || typeof command.title !== 'string' || !command.title.trim() || command.title.length > 300) throw new Error('Choose a drawing title up to 300 characters.')
    canvas.setDocumentTitle(command.title)
    garden.changed()
    return { title: canvas.getDocumentTitle() }
  }
})

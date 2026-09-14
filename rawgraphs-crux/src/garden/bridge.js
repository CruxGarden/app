import { createCommandSession } from './shared/command-session.js'
import { validateCommand } from './commands.js'
import { validateProject, DATA_FIELDS } from './model.js'

export async function startGarden() {
  let app
  let origin
  let expected = null
  let revision = 0,
    saved = 0,
    hydrating = true
  let timer,
    tail = Promise.resolve()
  const pending = new Map()
  let assetCache = new Map()
  const bar = document.createElement('div')
  bar.id = 'garden-project'
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button><input aria-label="Output name" value="Figure"><select aria-label="Output format"><option value="png">PNG</option><option value="svg">SVG</option><option value="jpeg">JPEG</option><option value="rawgraphs">Editable project</option></select><button>Save figure to Cruxspace</button>'
  const style = document.createElement('style')
  style.textContent =
    '#garden-project select{color:#fff;background:#24282c}#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:10000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}#garden-project input{width:120px;padding:3px 6px;color:#fff;background:#151515;border:1px solid #697078;border-radius:3px;font:11px system-ui}body{padding-bottom:34px!important}'
  document.head.append(style)
  document.body.append(bar)
  const workspace = document.querySelector('#root')
  workspace.inert = true
  const status = bar.querySelector('span')
  const show = (text) => {
    status.textContent = text
  }
  const send = (value) =>
    window.parent.postMessage(
      { type: 'crux:app', id: crypto.randomUUID(), ...value },
      origin && origin !== 'null' ? origin : '*'
    )
  const call = (value) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID()
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(
          new Error(
            'Garden did not confirm the save. Your draft is still open.'
          )
        )
      }, 60000)
      pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout)
          resolve(result)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
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
    timer = setTimeout(() => save().catch(() => {}), 800)
  }
  async function settle() {
    const deadline = Date.now() + 55000
    await app?.settle?.()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    while (app?.busy()) {
      if (Date.now() > deadline)
        throw new Error(
          'The dataset is still processing. Keep this editor open.'
        )
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    await app?.settle?.()
  }
  async function capture() {
    const snapshot = structuredClone(await app.capture())
    const nextAssets = new Map()
    const encode = async (value) => {
      const text = JSON.stringify(value)
      let ref = assetCache.get(text)
      if (!ref) {
        const bytes = new TextEncoder().encode(text).buffer
        const saved = await call({
          op: 'native-import',
          bytes,
          mimeType: 'application/json',
        })
        ref = {
          __cruxBinary: {
            path: saved.path,
            kind: 'buffer',
            type: 'application/json',
            size: bytes.byteLength,
          },
        }
      }
      nextAssets.set(text, ref)
      return ref
    }
    for (const key of snapshot.type === 'native' ? DATA_FIELDS : ['userInput'])
      snapshot.value[key] = await encode(snapshot.value[key])
    if (
      snapshot.type === 'native' &&
      snapshot.value.parseOptions.unstackedData != null
    )
      snapshot.value.parseOptions.unstackedData = await encode(
        snapshot.value.parseOptions.unstackedData
      )
    const doc = { version: 1, app: 'rawgraphs', project: { snapshot } }
    validateProject(doc)
    assetCache = nextAssets
    return doc
  }
  async function decodeProject(project) {
    const snapshot = structuredClone(project.snapshot)
    const decode = async (ref) => {
      const loaded = await call({
        op: 'native-read',
        path: ref.__cruxBinary.path,
      })
      const text = new TextDecoder().decode(loaded.bytes)
      assetCache.set(text, ref)
      return JSON.parse(text)
    }
    for (const key of snapshot.type === 'native' ? DATA_FIELDS : ['userInput'])
      snapshot.value[key] = await decode(snapshot.value[key])
    if (
      snapshot.type === 'native' &&
      snapshot.value.parseOptions.unstackedData != null
    )
      snapshot.value.parseOptions.unstackedData = await decode(
        snapshot.value.parseOptions.unstackedData
      )
    return snapshot
  }
  function save() {
    const operation = tail.then(async () => {
      clearTimeout(timer)
      await settle()
      if (hydrating)
        throw new Error('Wait for the saved project to finish opening.')
      if (revision === saved) return
      const saving = revision
      try {
        show('Saving project…')
        const doc = await capture()
        const result = await call({
          op: 'write',
          path: 'project.json',
          expected,
          content: JSON.stringify(doc),
        })
        expected = result.fingerprint
        saved = saving
        send({ op: 'dirty', dirty: revision !== saved })
        show(revision === saved ? 'Saved to Garden' : 'Unsaved changes')
      } catch (error) {
        show(error.message)
        throw error
      }
    })
    tail = operation.catch(() => {})
    return operation
  }
  async function saveFigure(label, format = 'png') {
    await save()
    if (format === 'rawgraphs') {
      const snapshot = await app.capture()
      if (snapshot.type !== 'native')
        throw Error('Load data before exporting an editable chart project.')
      const output = await call({
        op: 'save-output',
        label,
        mimeType: 'application/x-rawgraphs+json',
        bytes: new TextEncoder().encode(JSON.stringify(snapshot.value)).buffer,
      })
      show('Figure saved to Cruxspace')
      return output
    }
    const svg = app.svg()
    if (!svg)
      throw Error(
        'Map the required chart dimensions and resolve rendering errors before exporting.'
      )
    const rect = svg.getBoundingClientRect(),
      clone = svg.cloneNode(true)
    if (!rect.width || !rect.height || rect.width > 4000 || rect.height > 4000)
      throw Error('Use a rendered chart no larger than 4,000 pixels per side.')
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(Math.round(rect.width)))
    clone.setAttribute('height', String(Math.round(rect.height)))
    const xml = new XMLSerializer().serializeToString(clone)
    let output
    if (format === 'svg')
      output = await call({
        op: 'save-output',
        label,
        mimeType: 'image/svg+xml',
        bytes: new TextEncoder().encode(xml).buffer,
      })
    else {
      const url = URL.createObjectURL(
        new Blob([xml], { type: 'image/svg+xml' })
      )
      try {
        const image = await new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(Error('The chart could not be rendered.'))
          img.src = url
        })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(rect.width) * 2
        canvas.height = Math.round(rect.height) * 2
        const ctx = canvas.getContext('2d')
        if (format === 'jpeg') {
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, format === 'jpeg' ? 'image/jpeg' : 'image/png')
        )
        if (!blob) throw Error('The chart image could not be encoded.')
        output = await call({
          op: 'save-output',
          label,
          mimeType: blob.type,
          bytes: await blob.arrayBuffer(),
        })
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    show('Figure saved to Cruxspace')
    return output
  }
  const commands = createCommandSession({
    settle: async () => {
      if (hydrating || !app) throw Error('Wait for the chart editor to open.')
      await settle()
    },
    prepare: (value) => {
      const v = validateCommand(value)
      return v.op === 'save-figure'
        ? { mutates: true, apply: () => saveFigure(v.label, v.format) }
        : app.prepare(v)
    },
    save,
  })
  window.addEventListener('message', (event) => {
    if (
      event.source !== window.parent ||
      (origin !== undefined && event.origin !== origin)
    )
      return
    const message = event.data
    if (
      !message ||
      typeof message.type !== 'string' ||
      !message.type.startsWith('crux:app:')
    )
      return
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
        (error) =>
          send({ op: 'flushed', flushId: message.id, error: error.message })
      )
    } else if (message.type === 'crux:app:command') {
      const operation = commands.execute(message.command)
      operation.then(
        (result) => send({ op: 'tool-result', commandId: message.id, result }),
        (error) =>
          send({
            op: 'tool-result',
            commandId: message.id,
            error: error.message,
          })
      )
    }
  })
  bar.querySelectorAll('button')[0].onclick = () => save().catch(() => {})
  bar.querySelectorAll('button')[2].onclick = () =>
    commands
      .execute({
        op: 'save-figure',
        label: bar.querySelector('input').value,
        format: bar.querySelector('select').value,
      })
      .catch((error) => show(error.message))
  bar.querySelectorAll('button')[1].onclick = () => {
    if (
      revision === saved ||
      window.confirm('Discard the unsaved draft and reload the saved project?')
    )
      window.location.reload()
  }
  try {
    const loaded = await call({ op: 'read', path: 'project.json' })
    expected = loaded.fingerprint
    const doc = JSON.parse(loaded.content)
    validateProject(doc)
    const initial = doc.project ? await decodeProject(doc.project) : null
    return {
      initial,
      changed: dirty,
      failed(error) {
        show(error.message)
      },
      connect(api) {
        app = api
        hydrating = false
        workspace.inert = false
        show('Saved to Garden')
        dirty()
      },
    }
  } catch (error) {
    show(error.message)
    throw error
  }
}

// Garden bridge for the Song Crux (Crux Garden), bundled with Signal and inert
// outside a Workshop frame. Inside: it opens the saved MIDI from
// data/project.json into Signal's own song store, saves the song as a Standard
// MIDI File (a Garden binary asset referenced from the document) whenever the
// app marks it unsaved, flushes before a close, and puts MIDI and WAV renders
// into the Crux's outputs. App Tools drive the same operations and can write
// notes into a track.
import {
  Song,
  Track,
  TrackEventOf,
  emptyTrack,
  songFromMidi,
  songToMidi,
} from "@signal-app/core"
import type { ProgramChangeEvent as MidiProgramChange } from "midifile-ts"
import { renderAudio } from "@signal-app/player"
import { reaction } from "mobx"
import { rootStore } from "../components/App/App"
import { encodeWAV } from "../helpers/encodeAudio"
import { validateProject } from "../../../garden/document.js"

type ProgramChangeEvent = TrackEventOf<MidiProgramChange>
const framed = window.parent !== window
const WATCH_MS = 10_000
let origin: string | undefined
let expected: string | null = null
let revision = 0
let saved = 0
let hydrating = true
let timer: ReturnType<typeof setTimeout> | undefined
let status: HTMLElement | null = null
let lastMidi = ""
let tail: Promise<unknown> = Promise.resolve()
let commandTail: Promise<unknown> = Promise.resolve()
const pending = new Map<
  string,
  { resolve: (r: unknown) => void; reject: (e: Error) => void }
>()
const state = { name: "New song" }

type Message = Record<string, unknown>
const show = (text: string) => {
  if (status) status.textContent = text
}
const send = (value: Message) =>
  window.parent.postMessage(
    { type: "crux:app", id: crypto.randomUUID(), ...value },
    origin && origin !== "null" ? origin : "*",
  )
const call = <T = any>(value: Message, timeoutMs = 60_000): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const id = crypto.randomUUID()
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(
        new Error("Garden did not confirm the save. Your song is still open."),
      )
    }, timeoutMs)
    pending.set(id, {
      resolve: (r) => {
        clearTimeout(timeout)
        resolve(r as T)
      },
      reject: (e) => {
        clearTimeout(timeout)
        reject(e)
      },
    })
    send({ ...value, id })
  })

window.addEventListener("message", (event) => {
  if (!framed) return
  if (
    event.source !== window.parent ||
    (origin !== undefined && event.origin !== origin)
  )
    return
  const message = event.data
  if (
    !message ||
    typeof message.type !== "string" ||
    !message.type.startsWith("crux:app:")
  )
    return
  origin = event.origin
  if (message.type === "crux:app:result") {
    const request = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) request?.reject(new Error(message.error))
    else request?.resolve(message.result)
  } else if (message.type === "crux:app:flush") {
    ;(async () => {
      if (!hydrating) checkForChanges()
      do {
        await save()
      } while (revision !== saved)
    })().then(
      () => send({ op: "flushed", flushId: message.id }),
      (error) =>
        send({ op: "flushed", flushId: message.id, error: error.message }),
    )
  } else if (message.type === "crux:app:command") {
    const operation = commandTail.then(() => command(message.command))
    commandTail = operation.catch(() => {})
    operation.then(
      (result) => send({ op: "tool-result", commandId: message.id, result }),
      (error) =>
        send({ op: "tool-result", commandId: message.id, error: error.message }),
    )
  }
})

const song = () => rootStore.songStore.song
const songName = () => song().name.trim() || state.name
const serialize = () => songToMidi(song())
const midiKey = (bytes: Uint8Array) => {
  // A cheap identity for change detection: length plus a rolling hash
  let h = 0
  for (let i = 0; i < bytes.length; i++) h = (h * 31 + bytes[i]) | 0
  return `${bytes.length}:${h}`
}

function dirty() {
  if (hydrating) return
  revision++
  send({ op: "dirty", dirty: true })
  show("Unsaved changes")
  clearTimeout(timer)
  timer = setTimeout(() => save().catch(() => {}), 1500)
}
function checkForChanges() {
  try {
    const key = midiKey(serialize())
    if (key !== lastMidi) {
      lastMidi = key
      dirty()
    }
  } catch {
    /* mid-edit; the next tick compares again */
  }
}
function save(): Promise<void> {
  const operation = tail.then(async () => {
    clearTimeout(timer)
    if (hydrating) throw new Error("Wait for the saved song to finish opening.")
    if (revision === saved) return
    const saving = revision
    try {
      show("Saving song…")
      const midi = serialize()
      const bytes = midi.buffer.slice(
        midi.byteOffset,
        midi.byteOffset + midi.byteLength,
      ) as ArrayBuffer
      const stored = await call<{ path: string }>(
        { op: "native-import", bytes, mimeType: "audio/midi" },
        120_000,
      )
      const doc = {
        version: 1,
        app: "signal",
        project: {
          name: songName(),
          midi: {
            __cruxBinary: {
              path: stored.path,
              kind: "buffer",
              type: "audio/midi",
              size: bytes.byteLength,
            },
          },
          saved: new Date().toISOString(),
        },
      }
      validateProject(doc)
      const result = await call<{ fingerprint: string }>(
        { op: "write", path: "project.json", expected, content: JSON.stringify(doc) },
        120_000,
      )
      expected = result.fingerprint
      lastMidi = midiKey(midi)
      saved = saving
      if (revision === saved) song().isSaved = true
      send({ op: "dirty", dirty: revision !== saved })
      show(revision === saved ? "Saved to Garden" : "Unsaved changes")
    } catch (error) {
      show((error as Error).message)
      throw error
    }
  })
  tail = operation.catch(() => {})
  return operation
}

const noteCount = (track: Track) =>
  track.events.filter((e) => "subtype" in e && e.subtype === "note").length
const musicalTracks = () => song().tracks.filter((t) => !t.isConductorTrack)
function inspect() {
  const s = song()
  const conductor = s.conductorTrack
  const signature = conductor?.getTimeSignatureEvent(0)
  const tempo = conductor?.getTempo(0)
  return {
    name: songName(),
    timebase: s.timebase,
    tempo: tempo === undefined ? null : Math.round(tempo * 100) / 100,
    timeSignature: signature
      ? `${signature.numerator}/${signature.denominator}`
      : null,
    endOfSong: s.endOfSong,
    measures: s.measures.length,
    tracks: musicalTracks().map((t, i) => ({
      track: i + 1,
      name: t.name ?? "",
      channel: t.channel,
      program: t.getProgramNumber(0),
      notes: noteCount(t),
      rhythm: t.isRhythmTrack,
    })),
  }
}

type NoteInput = {
  tick: number
  duration: number
  noteNumber: number
  velocity?: number
}
function setNotes(value: Message) {
  const s = song()
  const index = Number(value.track)
  const tracks = musicalTracks()
  if (!Number.isInteger(index) || index < 1 || index > tracks.length + 1)
    throw new Error(
      `Choose a track from 1 to ${tracks.length} or ${tracks.length + 1} for a new one.`,
    )
  const notes = value.notes
  if (!Array.isArray(notes) || notes.length > 4000)
    throw new Error("Give up to 4 000 notes.")
  for (const n of notes as NoteInput[]) {
    if (
      !n ||
      typeof n !== "object" ||
      !Number.isInteger(n.tick) ||
      n.tick < 0 ||
      n.tick > 4_000_000 ||
      !Number.isInteger(n.duration) ||
      n.duration < 1 ||
      n.duration > 400_000 ||
      !Number.isInteger(n.noteNumber) ||
      n.noteNumber < 0 ||
      n.noteNumber > 127 ||
      (n.velocity !== undefined &&
        (!Number.isInteger(n.velocity) || n.velocity < 1 || n.velocity > 127))
    )
      throw new Error(
        "Each note needs an integer tick (480 per quarter note), duration, noteNumber 0–127 and optional velocity 1–127.",
      )
  }
  let track: Track
  if (index === tracks.length + 1) {
    // A new track on the next free channel, skipping the drum channel unless asked for
    const used = new Set(tracks.map((t) => t.channel))
    let channel = value.rhythm === true ? 9 : 0
    while (used.has(channel) || (channel === 9 && value.rhythm !== true))
      channel++
    if (channel > 15) throw new Error("All sixteen MIDI channels are in use.")
    track = emptyTrack(channel)
    s.addTrack(track)
  } else track = tracks[index - 1]
  track.transaction((t) => {
    if (value.replace !== false)
      t.removeEvents(
        t.events
          .filter((e) => "subtype" in e && e.subtype === "note")
          .map((e) => e.id),
      )
    t.addEvents(
      (notes as NoteInput[]).map((n) => ({
        type: "channel" as const,
        subtype: "note" as const,
        tick: n.tick,
        duration: n.duration,
        noteNumber: n.noteNumber,
        velocity: n.velocity ?? 100,
      })),
    )
    if (typeof value.name === "string" && value.name.trim())
      t.setName(value.name.trim().slice(0, 120))
    if (value.program !== undefined) {
      const program = Number(value.program)
      if (!Number.isInteger(program) || program < 0 || program > 127)
        throw new Error("The program (instrument) is a number from 0 to 127.")
      t.createOrUpdate<ProgramChangeEvent>({
        type: "channel",
        subtype: "programChange",
        tick: 0,
        value: program,
      })
    }
    t.updateEndOfTrack()
  })
  if (typeof value.tempo === "number") {
    if (value.tempo < 20 || value.tempo > 400)
      throw new Error("Tempo is 20 to 400 beats per minute.")
    s.conductorTrack?.setTempo(value.tempo, 0)
  }
  song().isSaved = false
}

const waitForFrame = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
async function renderWav(): Promise<ArrayBuffer> {
  const s = song()
  if (!s.allEvents.some((e) => e.tick >= 120))
    throw new Error("The song has no notes to render yet.")
  const data = rootStore.synth.loadedSoundFont?.data
  if (!data) throw new Error("The instrument sounds are still loading.")
  const buffer = await renderAudio(data, s.allEvents as any, s.timebase, 44100, {
    waitForEventLoop: waitForFrame,
  })
  const wav = await encodeWAV(buffer)
  return wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer
}
async function saveOutput(format: string, label: string) {
  if (!framed) throw new Error("Open this song inside Crux Garden to save outputs.")
  const kind = format === "wav" ? "wav" : "midi"
  const name =
    String(label ?? "").trim() || `${songName()} (${kind === "wav" ? "WAV" : "MIDI"})`
  if (name.length > 120) throw new Error("Use an output name up to 120 characters.")
  checkForChanges()
  await save()
  show(kind === "wav" ? "Rendering audio…" : "Writing MIDI…")
  let bytes: ArrayBuffer
  let mimeType: string
  if (kind === "wav") {
    bytes = await renderWav()
    mimeType = "audio/wav"
  } else {
    const midi = serialize()
    bytes = midi.buffer.slice(midi.byteOffset, midi.byteOffset + midi.byteLength) as ArrayBuffer
    mimeType = "audio/midi"
  }
  const output = await call(
    { op: "save-output", label: name, bytes, mimeType },
    10 * 60_000,
  )
  show(`Saved ${name} as ${kind === "wav" ? "an audio" : "a MIDI"} output.`)
  setTimeout(
    () => show(revision === saved ? "Saved to Garden" : "Unsaved changes"),
    3000,
  )
  return output
}
async function command(value: Message) {
  if (hydrating) throw new Error("Wait for the song to open.")
  if (value.op === "inspect") return inspect()
  if (value.op === "save-output")
    return saveOutput(String(value.format ?? "midi"), String(value.label ?? ""))
  if (value.op === "set-name") {
    const name = String(value.name ?? "").trim()
    if (!name || name.length > 200)
      throw new Error("Use a song name up to 200 characters.")
    song().name = name
    state.name = name
    checkForChanges()
    revision++
    await save()
    return inspect()
  }
  if (value.op === "set-notes") {
    setNotes(value)
    checkForChanges()
    revision++
    await save()
    return inspect()
  }
  throw new Error("Unsupported song operation.")
}

function mountBar() {
  const bar = document.createElement("div")
  bar.id = "garden-project"
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span>' +
    '<button type="button" id="save-song">Save song to Garden</button>' +
    '<label>Output name <input id="output-name" maxlength="120" placeholder="Song" /></label>' +
    '<label>Format <select id="output-format"><option value="midi">MIDI</option><option value="wav">WAV</option></select></label>' +
    '<button type="button" id="save-output">Save to Cruxspace</button>'
  const style = document.createElement("style")
  style.textContent =
    "#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}#garden-project [role=status]{flex:1}#garden-project label{display:flex;gap:6px;align-items:center}#garden-project input,#garden-project select{padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px;font:inherit}#garden-project button{padding:3px 8px;color:#e6e4dc;background:#2f3a34;border:1px solid #556059;border-radius:3px;font:inherit}#root{height:calc(100% - 34px)!important}"
  document.head.append(style)
  document.body.append(bar)
  status = bar.querySelector("span")
  ;(bar.querySelector("#save-song") as HTMLButtonElement).onclick = () => {
    checkForChanges()
    revision++
    save().catch((e) => show(e.message))
  }
  ;(bar.querySelector("#save-output") as HTMLButtonElement).onclick = () =>
    saveOutput(
      (bar.querySelector("#output-format") as HTMLSelectElement).value,
      (bar.querySelector("#output-name") as HTMLInputElement).value,
    ).catch((e) => show(e.message))
}

async function boot() {
  if (!framed) return
  mountBar()
  try {
    const loaded = await call<{ fingerprint: string; content: string }>({
      op: "read",
      path: "project.json",
    })
    expected = loaded.fingerprint
    const doc = JSON.parse(loaded.content)
    validateProject(doc)
    if (doc.project) {
      show("Opening song…")
      state.name = doc.project.name
      const stored = await call<{ bytes: ArrayBuffer }>(
        { op: "native-read", path: doc.project.midi.__cruxBinary.path },
        120_000,
      )
      const opened: Song = songFromMidi(new Uint8Array(stored.bytes))
      opened.name = doc.project.name
      opened.isSaved = true
      rootStore.songStore.song = opened
    }
    lastMidi = midiKey(serialize())
    hydrating = false
    show("Saved to Garden")
    if (!doc.project) {
      revision++
      save().catch(() => {})
    }
    // Signal marks the song unsaved after every edit; a slower comparison of the
    // MIDI bytes catches edits made while it was already unsaved, and songs opened
    // from a file or a drop (a new song object).
    reaction(
      () => ({ song: rootStore.songStore.song, saved: rootStore.songStore.song.isSaved }),
      ({ saved: isSaved }) => {
        if (!isSaved) checkForChanges()
        else if (revision === saved) return
      },
    )
    setInterval(() => {
      if (!document.hidden) checkForChanges()
    }, WATCH_MS)
  } catch (error) {
    show((error as Error).message)
    console.error("[garden]", error)
  }
}
void boot()

/* tslint:disable */
/* eslint-disable */
/**
* @param {string} name
* @param {Uint8Array} note_data
* @returns {Uint8Array}
*/
export function write_to_midi(name: string, note_data: Uint8Array): Uint8Array;
/**
* Parses a MIDI file and calls `note_cb` with `(note_id, start_beat, length)` for each note in the
* selected track as returned by `info_cb`.
*
* `info_cb` is a function that should be called with the object representing stats about the
* loaded MIDI file.  It should return a `Promise` which will then be awaited by this function.
* That promise should resolve to the track to be loaded.
* @param {Uint8Array} file_bytes
* @param {Function} info_cb
* @param {Function} note_cb
* @returns {Promise<any> | undefined}
*/
export function load_midi_to_raw_note_bytes(file_bytes: Uint8Array, info_cb: Function, note_cb: Function): Promise<any> | undefined;
/**
* @param {Function} play_note
* @param {Function} release_note
* @param {Function | undefined} [pitch_bend]
* @param {Function | undefined} [mod_wheel]
* @param {Function | undefined} [generic_control_handler]
* @returns {number}
*/
export function create_msg_handler_context(play_note: Function, release_note: Function, pitch_bend?: Function, mod_wheel?: Function, generic_control_handler?: Function): number;
/**
* @param {number} ctx_ptr
*/
export function drop_msg_handler_ctx(ctx_ptr: number): void;
/**
* @param {Uint8Array} evt_bytes
* @param {number} ctx_ptr
*/
export function handle_midi_evt(evt_bytes: Uint8Array, ctx_ptr: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly create_msg_handler_context: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly drop_msg_handler_ctx: (a: number) => void;
  readonly handle_midi_evt: (a: number, b: number, c: number) => void;
  readonly load_midi_to_raw_note_bytes: (a: number, b: number, c: number, d: number) => number;
  readonly write_to_midi: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly _dyn_core_17c5c806d64cb78___ops__function__FnMut_______Output______as_wasm_bindgen_c7104183a59ca42a___closure__WasmClosure___describe__invoke___wasm_bindgen_c7104183a59ca42a___JsValue_____: (a: number, b: number, c: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly wasm_bindgen_c7104183a59ca42a___convert__closures__invoke2_mut___wasm_bindgen_c7104183a59ca42a___JsValue__wasm_bindgen_c7104183a59ca42a___JsValue_____: (a: number, b: number, c: number, d: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;

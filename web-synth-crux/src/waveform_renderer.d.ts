/* tslint:disable */
/* eslint-disable */
/**
* @param {number} waveform_length_samples
* @param {number} sample_rate
* @param {number} width_px
* @param {number} height_px
* @returns {number}
*/
export function create_waveform_renderer_ctx(waveform_length_samples: number, sample_rate: number, width_px: number, height_px: number): number;
/**
* @param {number} ctx
* @param {Float32Array} new_samples
* @returns {number}
*/
export function append_samples_to_waveform(ctx: number, new_samples: Float32Array): number;
/**
* @param {number} ctx
*/
export function free_waveform_renderer_ctx(ctx: number): void;
/**
* @param {number} ctx
* @returns {number}
*/
export function get_waveform_buf_ptr(ctx: number): number;
/**
* @param {number} ctx
* @param {number} start_ms
* @param {number} end_ms
* @returns {number}
*/
export function render_waveform(ctx: number, start_ms: number, end_ms: number): number;
/**
* @param {number} ctx
* @returns {number}
*/
export function get_sample_count(ctx: number): number;
/**
* @returns {any}
*/
export function get_memory(): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly append_samples_to_waveform: (a: number, b: number, c: number) => number;
  readonly create_waveform_renderer_ctx: (a: number, b: number, c: number, d: number) => number;
  readonly free_waveform_renderer_ctx: (a: number) => void;
  readonly get_sample_count: (a: number) => number;
  readonly get_waveform_buf_ptr: (a: number) => number;
  readonly render_waveform: (a: number, b: number, c: number) => number;
  readonly get_memory: () => number;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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

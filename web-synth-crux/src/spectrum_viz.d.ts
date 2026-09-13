/* tslint:disable */
/* eslint-disable */
/**
* Returns a JSON-serialized array of scaler function definitions
* @returns {string}
*/
export function get_config_definition(): string;
/**
* @param {number} color_fn
* @param {number} scaler_fn
* @returns {number}
*/
export function new_context(color_fn: number, scaler_fn: number): number;
/**
* @param {number} ctx_ptr
* @param {number} color_fn
* @param {number} scaler_fn
*/
export function set_conf(ctx_ptr: number, color_fn: number, scaler_fn: number): void;
/**
* @param {number} ctx
*/
export function process_viz_data(ctx: number): void;
/**
* @param {number} ctx_ptr
* @returns {number}
*/
export function get_byte_frequency_data_ptr(ctx_ptr: number): number;
/**
* @param {number} ctx_ptr
* @returns {number}
*/
export function get_pixel_data_ptr(ctx_ptr: number): number;
/**
* @param {number} ctx_ptr
*/
export function drop_context(ctx_ptr: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly drop_context: (a: number) => void;
  readonly get_byte_frequency_data_ptr: (a: number) => number;
  readonly get_config_definition: (a: number) => void;
  readonly get_pixel_data_ptr: (a: number) => number;
  readonly new_context: (a: number, b: number) => number;
  readonly process_viz_data: (a: number) => void;
  readonly set_conf: (a: number, b: number, c: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
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

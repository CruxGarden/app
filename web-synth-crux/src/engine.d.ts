/* tslint:disable */
/* eslint-disable */
/**
* Entrypoint for the application.  This function is called from the JS side as soon as the Wasm
* blob is loaded.  It handles setting up application state, rendering the initial UI, and loading
* the last saved composition from the user.
*/
export function init(): void;
/**
* @param {string} vc_id
* @param {string} target_dom_id
*/
export function render_small_view(vc_id: string, target_dom_id: string): void;
/**
* @param {string} vc_id
* @param {string} target_dom_id
*/
export function cleanup_small_view(vc_id: string, target_dom_id: string): void;
/**
* @param {string} vc_id
*/
export function persist_vc_state(vc_id: string): void;
/**
* @param {string} vc_id
* @returns {string}
*/
export function get_state_key(vc_id: string): string;
/**
* Returns a list of all samples that are in active use by any VC.  The list is non-deduped and
* can't be due to limitations of the API's use of `JsValue`.
* @returns {any[]}
*/
export function get_active_samples(): any[];
/**
* Creates a new view context from the provided name in the active subgraph and sets it as the main
* view context for that subgraph.
*
* Returns the created view context's ID.
* @param {string} vc_name
* @param {string} display_name
* @param {string | undefined} [initial_state]
* @returns {string}
*/
export function create_view_context(vc_name: string, display_name: string, initial_state?: string): string;
/**
*/
export function handle_window_close(): void;
/**
* Serializes the whole VCM (VC definitions, connections, foreign connectables, subgraphs) to
* `localStorage`.  Does *not* persist per-VC content state — callers that need that must persist
* each VC first (e.g. via `persist_vc_state`).
*/
export function save_all(): void;
/**
* @param {string} vc_ids
* @param {string} subgraph_id
*/
export function move_vfcs_to_subgraph(vc_ids: string, subgraph_id: string): void;
/**
* @param {string} serialized
* @returns {string}
*/
export function load_serialized_subgraph(serialized: string): string;
/**
*/
export function undo_view_change(): void;
/**
*/
export function redo_view_change(): void;
/**
*/
export function reset_vcm(): void;
/**
* @param {string} uuid_str
* @param {string} title
*/
export function set_vc_title(uuid_str: string, title: string): void;
/**
* @param {string} vc_id
* @returns {any}
*/
export function get_vc_connectables(vc_id: string): any;
/**
* @param {string} connections_json
*/
export function set_connections(connections_json: string): void;
/**
* @param {string} foreign_connectables_json
*/
export function set_foreign_connectables(foreign_connectables_json: string): void;
/**
* @param {string} id
*/
export function delete_vc_by_id(id: string): void;
/**
* @param {number} ix0
* @param {number} ix1
*/
export function swap_vc_positions(ix0: number, ix1: number): void;
/**
* @param {string} uuid_str
*/
export function switch_view_context(uuid_str: string): void;
/**
* @returns {string}
*/
export function add_subgraph(): string;
/**
* @param {string} subgraph_id
*/
export function delete_subgraph(subgraph_id: string): void;
/**
* @param {string} subgraph_id
*/
export function set_active_subgraph_id(subgraph_id: string): void;
/**
* @param {string} subgraph_id
* @param {string} new_name
*/
export function rename_subgraph(subgraph_id: string, new_name: string): void;
/**
* @param {string} subgraph_id
* @param {string} subgraph_name_override
* @returns {string}
*/
export function serialize_subgraph(subgraph_id: string, subgraph_name_override: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly add_subgraph: (a: number) => void;
  readonly cleanup_small_view: (a: number, b: number, c: number, d: number) => void;
  readonly create_view_context: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly delete_subgraph: (a: number, b: number) => void;
  readonly delete_vc_by_id: (a: number, b: number) => void;
  readonly get_active_samples: (a: number) => void;
  readonly get_state_key: (a: number, b: number, c: number) => void;
  readonly get_vc_connectables: (a: number, b: number) => number;
  readonly init: () => void;
  readonly load_serialized_subgraph: (a: number, b: number, c: number) => void;
  readonly move_vfcs_to_subgraph: (a: number, b: number, c: number, d: number) => void;
  readonly persist_vc_state: (a: number, b: number) => void;
  readonly redo_view_change: () => void;
  readonly rename_subgraph: (a: number, b: number, c: number, d: number) => void;
  readonly render_small_view: (a: number, b: number, c: number, d: number) => void;
  readonly reset_vcm: () => void;
  readonly serialize_subgraph: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly set_active_subgraph_id: (a: number, b: number) => void;
  readonly set_connections: (a: number, b: number) => void;
  readonly set_foreign_connectables: (a: number, b: number) => void;
  readonly set_vc_title: (a: number, b: number, c: number, d: number) => void;
  readonly swap_vc_positions: (a: number, b: number) => void;
  readonly switch_view_context: (a: number, b: number) => void;
  readonly undo_view_change: () => void;
  readonly save_all: () => void;
  readonly handle_window_close: () => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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

import { init_composition_sharing, hide_composition_sharing, unhide_composition_sharing, persist_composition_sharing, cleanup_composition_sharing } from './compositionSharing';
import { init_control_panel, cleanup_control_panel, hide_control_panel, unhide_control_panel, persist_control_panel, get_control_panel_audio_connectables } from './controlPanel';
import { init_equalizer, hide_equalizer, unhide_equalizer, persist_equalizer, cleanup_equalizer, get_equalizer_audio_connectables } from './equalizer/equalizer';
import { init_faust_editor, hide_faust_editor, unhide_faust_editor, persist_faust_editor, cleanup_faust_editor, get_faust_editor_connectables, render_faust_editor_small_view, cleanup_faust_editor_small_view } from './faustEditor';
import { init_filter_designer, hide_filter_designer, unhide_filter_designer, persist_filter_designer, cleanup_filter_designer, get_filter_designer_audio_connectables } from './filterDesigner';
import { init_granulator, cleanup_granulator, hide_granulator, unhide_granulator, persist_granulator, build_granulator_audio_connectables, granulator_list_used_samples } from './granulator';
import { init_graph_editor, hide_graph_editor, unhide_graph_editor, persist_graph_editor, cleanup_graph_editor, arrange_graph_editor_nodes } from './graphEditor';
import { init_looper, hide_looper, unhide_looper, persist_looper, cleanup_looper, get_looper_audio_connectables } from './looper/Looper';
import { hide_midi_editor, unhide_midi_editor, init_midi_editor, persist_midi_editor, cleanup_midi_editor, get_midi_editor_audio_connectables } from './midiEditor';
import { init_midi_keyboard, hide_midi_keyboard, unhide_midi_keyboard, persist_midi_keyboard, cleanup_midi_keyboard, get_midi_keyboard_audio_connectables, render_midi_keyboard_small_view, cleanup_midi_keyboard_small_view } from './midiKeyboard';
import { create_empty_audio_connectables } from './redux/modules/vcmUtils';
import { init_sample_library, cleanup_sample_library, hide_sample_library, unhide_sample_library, persist_sample_library } from './sampleLibrary';
import { init_sampler, hide_sampler, unhide_sampler, persist_sampler, cleanup_sampler, get_sampler_audio_connectables, sampler_list_used_samples } from './sampler/sampler';
import { init_sequencer, cleanup_sequencer, hide_sequencer, unhide_sequencer, persist_sequencer, get_sequencer_audio_connectables, render_sequencer_small_view, cleanup_sequencer_small_view, sequencer_list_used_samples } from './sequencer';
import { init_signal_analyzer, hide_signal_analyzer, unhide_signal_analyzer, persist_signal_analyzer, cleanup_signal_analyzer, get_signal_analyzer_audio_connectables } from './signalAnalyzer/signalAnalyzer';
import { init_synth_designer, hide_synth_designer, unhide_synth_designer, persist_synth_designer, cleanup_synth_designer, get_synth_designer_audio_connectables } from './synthDesigner';
import { init_view_contexts, add_view_context, add_foreign_connectable, add_connection, delete_connection, set_connections as set_connections2, set_foreign_connectables as set_foreign_connectables2, set_view_contexts, delete_foreign_connectable, delete_view_context, set_active_vc_id, set_subgraphs, set_vc_title as set_vc_title2, list_foreign_node_used_samples } from './vcInterop';
import { init_welcome_page, hide_welcome_page, unhide_welcome_page, persist_welcome_page, cleanup_welcome_page } from './welcomePage/WelcomePage';
import * as __wbg_star0 from './vcInterop';

let wasm;

const heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let heap_next = heap.length;

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8Memory0 = null;

function getUint8Memory0() {
    if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}
/**
* Entrypoint for the application.  This function is called from the JS side as soon as the Wasm
* blob is loaded.  It handles setting up application state, rendering the initial UI, and loading
* the last saved composition from the user.
*/
export function init() {
    wasm.init();
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8Memory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}
/**
* @param {string} vc_id
* @param {string} target_dom_id
*/
export function render_small_view(vc_id, target_dom_id) {
    const ptr0 = passStringToWasm0(vc_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(target_dom_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    wasm.render_small_view(ptr0, len0, ptr1, len1);
}

/**
* @param {string} vc_id
* @param {string} target_dom_id
*/
export function cleanup_small_view(vc_id, target_dom_id) {
    const ptr0 = passStringToWasm0(vc_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(target_dom_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    wasm.cleanup_small_view(ptr0, len0, ptr1, len1);
}

/**
* @param {string} vc_id
*/
export function persist_vc_state(vc_id) {
    const ptr0 = passStringToWasm0(vc_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.persist_vc_state(ptr0, len0);
}

let cachedInt32Memory0 = null;

function getInt32Memory0() {
    if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
        cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32Memory0;
}
/**
* @param {string} vc_id
* @returns {string}
*/
export function get_state_key(vc_id) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(vc_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.get_state_key(retptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

let cachedUint32Memory0 = null;

function getUint32Memory0() {
    if (cachedUint32Memory0 === null || cachedUint32Memory0.byteLength === 0) {
        cachedUint32Memory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32Memory0;
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getUint32Memory0();
    const slice = mem.subarray(ptr / 4, ptr / 4 + len);
    const result = [];
    for (let i = 0; i < slice.length; i++) {
        result.push(takeObject(slice[i]));
    }
    return result;
}
/**
* Returns a list of all samples that are in active use by any VC.  The list is non-deduped and
* can't be due to limitations of the API's use of `JsValue`.
* @returns {any[]}
*/
export function get_active_samples() {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.get_active_samples(retptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var v1 = getArrayJsValueFromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4, 4);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}
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
export function create_view_context(vc_name, display_name, initial_state) {
    let deferred4_0;
    let deferred4_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(vc_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(display_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(initial_state) ? 0 : passStringToWasm0(initial_state, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len2 = WASM_VECTOR_LEN;
        wasm.create_view_context(retptr, ptr0, len0, ptr1, len1, ptr2, len2);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        deferred4_0 = r0;
        deferred4_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
*/
export function handle_window_close() {
    wasm.handle_window_close();
}

/**
* Serializes the whole VCM (VC definitions, connections, foreign connectables, subgraphs) to
* `localStorage`.  Does *not* persist per-VC content state — callers that need that must persist
* each VC first (e.g. via `persist_vc_state`).
*/
export function save_all() {
    wasm.save_all();
}

/**
* @param {string} vc_ids
* @param {string} subgraph_id
*/
export function move_vfcs_to_subgraph(vc_ids, subgraph_id) {
    const ptr0 = passStringToWasm0(vc_ids, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(subgraph_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    wasm.move_vfcs_to_subgraph(ptr0, len0, ptr1, len1);
}

/**
* @param {string} serialized
* @returns {string}
*/
export function load_serialized_subgraph(serialized) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(serialized, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.load_serialized_subgraph(retptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
*/
export function undo_view_change() {
    wasm.undo_view_change();
}

/**
*/
export function redo_view_change() {
    wasm.redo_view_change();
}

/**
*/
export function reset_vcm() {
    wasm.reset_vcm();
}

/**
* @param {string} uuid_str
* @param {string} title
*/
export function set_vc_title(uuid_str, title) {
    const ptr0 = passStringToWasm0(uuid_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(title, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    wasm.set_vc_title(ptr0, len0, ptr1, len1);
}

/**
* @param {string} vc_id
* @returns {any}
*/
export function get_vc_connectables(vc_id) {
    const ptr0 = passStringToWasm0(vc_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_vc_connectables(ptr0, len0);
    return takeObject(ret);
}

/**
* @param {string} connections_json
*/
export function set_connections(connections_json) {
    const ptr0 = passStringToWasm0(connections_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.set_connections(ptr0, len0);
}

/**
* @param {string} foreign_connectables_json
*/
export function set_foreign_connectables(foreign_connectables_json) {
    const ptr0 = passStringToWasm0(foreign_connectables_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.set_foreign_connectables(ptr0, len0);
}

/**
* @param {string} id
*/
export function delete_vc_by_id(id) {
    const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.delete_vc_by_id(ptr0, len0);
}

/**
* @param {number} ix0
* @param {number} ix1
*/
export function swap_vc_positions(ix0, ix1) {
    wasm.swap_vc_positions(ix0, ix1);
}

/**
* @param {string} uuid_str
*/
export function switch_view_context(uuid_str) {
    const ptr0 = passStringToWasm0(uuid_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.switch_view_context(ptr0, len0);
}

/**
* @returns {string}
*/
export function add_subgraph() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.add_subgraph(retptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
* @param {string} subgraph_id
*/
export function delete_subgraph(subgraph_id) {
    const ptr0 = passStringToWasm0(subgraph_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.delete_subgraph(ptr0, len0);
}

/**
* @param {string} subgraph_id
*/
export function set_active_subgraph_id(subgraph_id) {
    const ptr0 = passStringToWasm0(subgraph_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.set_active_subgraph_id(ptr0, len0);
}

/**
* @param {string} subgraph_id
* @param {string} new_name
*/
export function rename_subgraph(subgraph_id, new_name) {
    const ptr0 = passStringToWasm0(subgraph_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(new_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    wasm.rename_subgraph(ptr0, len0, ptr1, len1);
}

/**
* @param {string} subgraph_id
* @param {string} subgraph_name_override
* @returns {string}
*/
export function serialize_subgraph(subgraph_id, subgraph_name_override) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(subgraph_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(subgraph_name_override, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.serialize_subgraph(retptr, ptr0, len0, ptr1, len1);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        deferred3_0 = r0;
        deferred3_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    const mem = getUint32Memory0();
    for (let i = 0; i < array.length; i++) {
        mem[ptr / 4 + i] = addHeapObject(array[i]);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function notDefined(what) { return () => { throw new Error(`${what} is not defined`); }; }

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    };
    imports.wbg.__wbg_setsubgraphs_aac83e3cef1dac32 = function(arg0, arg1, arg2, arg3) {
        set_subgraphs(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    };
    imports.wbg.__wbg_setvctitle_42ed603beba1c890 = function(arg0, arg1, arg2, arg3) {
        set_vc_title2(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    };
    imports.wbg.__wbg_deleteforeignconnectable_aeec34802a18332e = function(arg0, arg1) {
        delete_foreign_connectable(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_setviewcontexts_a210bdb9e056503c = function(arg0, arg1, arg2, arg3) {
        set_view_contexts(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    };
    imports.wbg.__wbg_listforeignnodeusedsamples_43a409a656af08bb = function(arg0, arg1, arg2) {
        const ret = list_foreign_node_used_samples(getStringFromWasm0(arg1, arg2));
        const ptr1 = passArrayJsValueToWasm0(ret, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_deleteconnection_3de4dbe0aa3d6d8f = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
        delete_connection(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7));
    };
    imports.wbg.__wbg_setforeignconnectables_4839b14a9b892e27 = function(arg0, arg1) {
        set_foreign_connectables2(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_random_43a1b35c63e94891 = typeof Math.random == 'function' ? Math.random : notDefined('Math.random');
    imports.wbg.__wbg_arrangegrapheditornodes_32cf88dab3520893 = function(arg0, arg1, arg2, arg3, arg4, arg5) {
        arrange_graph_editor_nodes(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), arg4 >>> 0, arg5 >>> 0);
    };
    imports.wbg.__wbg_removeItem_3654c67909f8a47b = function(arg0, arg1) {
        localStorage.removeItem(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_deleteviewcontext_b56208854001cb2a = function(arg0, arg1) {
        delete_view_context(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_setactivevcid_a62fceae556cee4e = function(arg0, arg1) {
        set_active_vc_id(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_setItem_f5b30b2272928eb2 = function(arg0, arg1, arg2, arg3) {
        localStorage.setItem(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    };
    imports.wbg.__wbg_addviewcontext_987197e2a271a137 = function(arg0, arg1, arg2, arg3, arg4, arg5) {
        add_view_context(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5));
    };
    imports.wbg.__wbg_addforeignconnectable_b901feddafef7557 = function(arg0, arg1, arg2) {
        const ret = add_foreign_connectable(getStringFromWasm0(arg1, arg2));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_addconnection_81e92a783078c946 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
        add_connection(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7));
    };
    imports.wbg.__wbg_setconnections_55ef6e9d95390c9c = function(arg0, arg1) {
        set_connections2(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_getItem_ef066280e58a69c6 = function(arg0, arg1, arg2) {
        const ret = localStorage.getItem(getStringFromWasm0(arg1, arg2));
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_initviewcontexts_e1405606dbe4f5cd = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
        init_view_contexts(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7), getStringFromWasm0(arg8, arg9), getStringFromWasm0(arg10, arg11));
    };
    imports.wbg.__wbg_createemptyaudioconnectables_a597ddac17af655e = function(arg0, arg1) {
        const ret = create_empty_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_hidelooper_4dbcc941c9816460 = function(arg0, arg1) {
        hide_looper(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initlooper_ffc583f2d5e1fd31 = function(arg0, arg1) {
        init_looper(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidesampler_463b88d7623bf389 = function(arg0, arg1) {
        hide_sampler(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initsampler_866fa8d63ca4e09a = function(arg0, arg1) {
        init_sampler(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidelooper_b70de71343e82de7 = function(arg0, arg1) {
        unhide_looper(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanuplooper_b891048c7d3417fb = function(arg0, arg1) {
        cleanup_looper(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hideequalizer_75627c01915258ae = function(arg0, arg1) {
        hide_equalizer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidesequencer_7057ef35e77211f7 = function(arg0, arg1) {
        hide_sequencer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initequalizer_a6447a3f05b4a933 = function(arg0, arg1) {
        init_equalizer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initsequencer_95eafba9bc0565f5 = function(arg0, arg1) {
        init_sequencer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistlooper_3b7a002e8758cdda = function(arg0, arg1) {
        persist_looper(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidesampler_ab3b7f75545f7d52 = function(arg0, arg1) {
        unhide_sampler(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupsampler_b179b8b61ea02a96 = function(arg0, arg1) {
        cleanup_sampler(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidegranulator_b13b860974965854 = function(arg0, arg1) {
        hide_granulator(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initgranulator_43ad3570a0ca4ba9 = function(arg0, arg1) {
        init_granulator(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistsampler_72b6d22079279df1 = function(arg0, arg1) {
        persist_sampler(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidemidieditor_5488bda71c1be5b2 = function(arg0, arg1) {
        hide_midi_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initmidieditor_bc1b266b9c25f236 = function(arg0, arg1) {
        init_midi_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhideequalizer_2601c6b5962ab417 = function(arg0, arg1) {
        unhide_equalizer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidesequencer_a483a874d71f95f3 = function(arg0, arg1) {
        unhide_sequencer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupequalizer_58c019ae9d02278e = function(arg0, arg1) {
        cleanup_equalizer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupsequencer_17b470e4792d9c3c = function(arg0, arg1) {
        cleanup_sequencer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidefausteditor_53bb50de910cc37f = function(arg0, arg1) {
        hide_faust_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidegrapheditor_fa4a102bad3cdf87 = function(arg0, arg1) {
        hide_graph_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidewelcomepage_19bd93313c096af9 = function(arg0, arg1) {
        hide_welcome_page(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initfausteditor_0bd630cf5169b15d = function(arg0, arg1) {
        init_faust_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initgrapheditor_4ef3c1d1b96f7271 = function(arg0, arg1) {
        init_graph_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initwelcomepage_e27336f068c076d7 = function(arg0, arg1) {
        init_welcome_page(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistequalizer_359491a647614306 = function(arg0, arg1) {
        persist_equalizer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistsequencer_f8ae517d932b495e = function(arg0, arg1) {
        persist_sequencer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidegranulator_cff68c3cd68391e8 = function(arg0, arg1) {
        unhide_granulator(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupgranulator_0d801a4c98c04c0b = function(arg0, arg1) {
        cleanup_granulator(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidecontrolpanel_5f0ccfbb12c3c24b = function(arg0, arg1) {
        hide_control_panel(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidemidikeyboard_4341072f93d67619 = function(arg0, arg1) {
        hide_midi_keyboard(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initcontrolpanel_69db81e8a47a7228 = function(arg0, arg1) {
        init_control_panel(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initmidikeyboard_424e737c9b842362 = function(arg0, arg1) {
        init_midi_keyboard(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistgranulator_a255e06105e118bc = function(arg0, arg1) {
        persist_granulator(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidemidieditor_51e3579dc953dd8d = function(arg0, arg1) {
        unhide_midi_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupmidieditor_e15a3cb424744258 = function(arg0, arg1) {
        cleanup_midi_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidesamplelibrary_54022f3b7ada8162 = function(arg0, arg1) {
        hide_sample_library(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidesynthdesigner_961b867a316d286c = function(arg0, arg1) {
        hide_synth_designer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initsamplelibrary_0bb6397657fe1491 = function(arg0, arg1) {
        init_sample_library(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initsynthdesigner_8965c0082dd0e080 = function(arg0, arg1) {
        init_synth_designer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistmidieditor_ba10866411ab07e0 = function(arg0, arg1) {
        persist_midi_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidefausteditor_2780d1b87f69fb68 = function(arg0, arg1) {
        unhide_faust_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidegrapheditor_8159c543a5ebee68 = function(arg0, arg1) {
        unhide_graph_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidewelcomepage_969f415df05e8e49 = function(arg0, arg1) {
        unhide_welcome_page(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupfausteditor_43b143f66ec7dc67 = function(arg0, arg1) {
        cleanup_faust_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupgrapheditor_8c29ca8a8796a169 = function(arg0, arg1) {
        cleanup_graph_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupwelcomepage_bfd252411101fe30 = function(arg0, arg1) {
        cleanup_welcome_page(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidefilterdesigner_d00d5ced9794165e = function(arg0, arg1) {
        hide_filter_designer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidesignalanalyzer_caa2f3862b5927de = function(arg0, arg1) {
        hide_signal_analyzer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initfilterdesigner_3041ea47a645e0df = function(arg0, arg1) {
        init_filter_designer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initsignalanalyzer_553b98ada659b3a1 = function(arg0, arg1) {
        init_signal_analyzer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistfausteditor_62d5e44e6c149e20 = function(arg0, arg1) {
        persist_faust_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistgrapheditor_90e42ca3f82bc799 = function(arg0, arg1) {
        persist_graph_editor(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistwelcomepage_cd667dc07465aa08 = function(arg0, arg1) {
        persist_welcome_page(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidecontrolpanel_dc0720c0a5f9e175 = function(arg0, arg1) {
        unhide_control_panel(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidemidikeyboard_426620110146d21a = function(arg0, arg1) {
        unhide_midi_keyboard(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupcontrolpanel_fca2da5e744fe88b = function(arg0, arg1) {
        cleanup_control_panel(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupmidikeyboard_af1c469dfc5429b1 = function(arg0, arg1, arg2) {
        const ret = cleanup_midi_keyboard(getStringFromWasm0(arg1, arg2));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_persistcontrolpanel_c27fd5d6f73cef04 = function(arg0, arg1) {
        persist_control_panel(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistmidikeyboard_6d91aa57476dd4bb = function(arg0, arg1) {
        persist_midi_keyboard(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidesamplelibrary_7bdc85dc7410e8d7 = function(arg0, arg1) {
        unhide_sample_library(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidesynthdesigner_d1469f856f556fe6 = function(arg0, arg1) {
        unhide_synth_designer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupsamplelibrary_f1f4bdfa640fac01 = function(arg0, arg1) {
        cleanup_sample_library(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupsynthdesigner_e2c4289debec3272 = function(arg0, arg1, arg2) {
        const ret = cleanup_synth_designer(getStringFromWasm0(arg1, arg2));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_persistsamplelibrary_3484f0849754f65a = function(arg0, arg1) {
        persist_sample_library(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistsynthdesigner_1f7b78783fa60170 = function(arg0, arg1) {
        persist_synth_designer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidefilterdesigner_bd4fc7ae2995c6b8 = function(arg0, arg1) {
        unhide_filter_designer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_unhidesignalanalyzer_6d0ee72cd50213a3 = function(arg0, arg1) {
        unhide_signal_analyzer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupfilterdesigner_ed2bf69336691543 = function(arg0, arg1) {
        cleanup_filter_designer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupsignalanalyzer_d766a32b2527483c = function(arg0, arg1) {
        cleanup_signal_analyzer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistfilterdesigner_d04181b0008a3966 = function(arg0, arg1) {
        persist_filter_designer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistsignalanalyzer_a8d775bf14351ddd = function(arg0, arg1) {
        persist_signal_analyzer(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_hidecompositionsharing_c4fcb1d0e7dd15bb = function(arg0, arg1) {
        hide_composition_sharing(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_initcompositionsharing_417368b6fa70cd3e = function(arg0, arg1) {
        init_composition_sharing(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_samplerlistusedsamples_0420ade4b376264a = function(arg0, arg1, arg2) {
        const ret = sampler_list_used_samples(getStringFromWasm0(arg1, arg2));
        const ptr1 = passArrayJsValueToWasm0(ret, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_unhidecompositionsharing_f3a8e977d422d05d = function(arg0, arg1) {
        unhide_composition_sharing(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_cleanupcompositionsharing_1b660faf01c3fedb = function(arg0, arg1) {
        cleanup_composition_sharing(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_persistcompositionsharing_7807e2bf7ab7fb6e = function(arg0, arg1) {
        persist_composition_sharing(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_rendersequencersmallview_e0538ad4a91404c5 = function(arg0, arg1, arg2, arg3) {
        render_sequencer_small_view(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    };
    imports.wbg.__wbg_sequencerlistusedsamples_a5a1bd62726e4ba7 = function(arg0, arg1, arg2) {
        const ret = sequencer_list_used_samples(getStringFromWasm0(arg1, arg2));
        const ptr1 = passArrayJsValueToWasm0(ret, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_cleanupsequencersmallview_1c21a5a4291f7b8a = function(arg0, arg1, arg2, arg3) {
        cleanup_sequencer_small_view(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    };
    imports.wbg.__wbg_granulatorlistusedsamples_a4329579c18d7b83 = function(arg0, arg1, arg2) {
        const ret = granulator_list_used_samples(getStringFromWasm0(arg1, arg2));
        const ptr1 = passArrayJsValueToWasm0(ret, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_getfausteditorconnectables_79ae2b5eff547be7 = function(arg0, arg1) {
        const ret = get_faust_editor_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getlooperaudioconnectables_7ca058a44fb19e9b = function(arg0, arg1) {
        const ret = get_looper_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getsampleraudioconnectables_07b92db58ba69217 = function(arg0, arg1) {
        const ret = get_sampler_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_renderfausteditorsmallview_8f41b9405500d924 = function(arg0, arg1, arg2, arg3) {
        render_faust_editor_small_view(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    };
    imports.wbg.__wbg_cleanupfausteditorsmallview_0dd8f88955ad0c7d = function(arg0, arg1, arg2, arg3) {
        cleanup_faust_editor_small_view(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    };
    imports.wbg.__wbg_rendermidikeyboardsmallview_15e1cfff6d7570eb = function(arg0, arg1, arg2, arg3) {
        render_midi_keyboard_small_view(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    };
    imports.wbg.__wbg_cleanupmidikeyboardsmallview_f0d56ae385305d22 = function(arg0, arg1, arg2, arg3) {
        cleanup_midi_keyboard_small_view(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    };
    imports.wbg.__wbg_getequalizeraudioconnectables_90cadbac812451fa = function(arg0, arg1) {
        const ret = get_equalizer_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getsequenceraudioconnectables_e5ed784a075dfb32 = function(arg0, arg1) {
        const ret = get_sequencer_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getmidieditoraudioconnectables_b07e414ee25d38f5 = function(arg0, arg1) {
        const ret = get_midi_editor_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_buildgranulatoraudioconnectables_59e70faa39205dfc = function(arg0, arg1) {
        const ret = build_granulator_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getcontrolpanelaudioconnectables_93d5c7304fe4f0bb = function(arg0, arg1) {
        const ret = get_control_panel_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getmidikeyboardaudioconnectables_e698b8de5dc1e263 = function(arg0, arg1) {
        const ret = get_midi_keyboard_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getsynthdesigneraudioconnectables_8411717a3b7b2e57 = function(arg0, arg1) {
        const ret = get_synth_designer_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getfilterdesigneraudioconnectables_5176862b869bca4c = function(arg0, arg1) {
        const ret = get_filter_designer_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getsignalanalyzeraudioconnectables_9b65b53aa2477c4d = function(arg0, arg1) {
        const ret = get_signal_analyzer_audio_connectables(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_log_151eb4333ef0fe39 = function(arg0, arg1, arg2, arg3) {
        console.log(getObject(arg0), getObject(arg1), getObject(arg2), getObject(arg3));
    };
    imports.wbg.__wbg_info_80803d9a3f0aad16 = function(arg0, arg1, arg2, arg3) {
        console.info(getObject(arg0), getObject(arg1), getObject(arg2), getObject(arg3));
    };
    imports.wbg.__wbg_warn_5d3f783b0bae8943 = function(arg0, arg1, arg2, arg3) {
        console.warn(getObject(arg0), getObject(arg1), getObject(arg2), getObject(arg3));
    };
    imports.wbg.__wbg_debug_7d879afce6cf56cb = function(arg0, arg1, arg2, arg3) {
        console.debug(getObject(arg0), getObject(arg1), getObject(arg2), getObject(arg3));
    };
    imports.wbg.__wbg_error_8e3928cfb8a43e2b = function(arg0) {
        console.error(getObject(arg0));
    };
    imports.wbg.__wbg_error_696630710900ec44 = function(arg0, arg1, arg2, arg3) {
        console.error(getObject(arg0), getObject(arg1), getObject(arg2), getObject(arg3));
    };
    imports.wbg.__wbg_new_abda76e883ba8a5f = function() {
        const ret = new Error();
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_stack_658279fe44541cf6 = function(arg0, arg1) {
        const ret = getObject(arg1).stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_error_f851667af71bcfc6 = function(arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        }
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports['./vcInterop'] = __wbg_star0;

    return imports;
}

function __wbg_init_memory(imports, maybe_memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedInt32Memory0 = null;
    cachedUint32Memory0 = null;
    cachedUint8Memory0 = null;


    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(input) {
    if (wasm !== undefined) return wasm;

    if (typeof input === 'undefined') {
        input = new URL('engine_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof input === 'string' || (typeof Request === 'function' && input instanceof Request) || (typeof URL === 'function' && input instanceof URL)) {
        input = fetch(input);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await input, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync }
export default __wbg_init;

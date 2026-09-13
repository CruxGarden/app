/// <reference types="emscripten" />

export interface GhostscriptModule extends EmscriptenModule {
    callMain(args?: string[]): number;
    FS: typeof FS;
}

export type GhostscriptModuleFactory = EmscriptenModuleFactory<GhostscriptModule>;

export interface GhostscriptLoadOptions {
    /** Base URL to the gs-wasm assets folder (containing gs.js and gs.wasm) */
    baseUrl?: string;
    /** Direct URL to gs.wasm file (overrides baseUrl for WASM) */
    wasmUrl?: string;
    /** Custom locateFile function (overrides baseUrl and wasmUrl) */
    locateFile?: (path: string) => string;
    /** Custom print function for stdout */
    print?: (text: string) => void;
    /** Custom print function for stderr */
    printErr?: (text: string) => void;
}

/**
 * Load Ghostscript WASM module
 */
export declare function loadGhostscriptWASM(options?: GhostscriptLoadOptions): Promise<GhostscriptModule>;

export default loadGhostscriptWASM;

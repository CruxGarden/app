# Record in Crux Garden

Upstream: https://github.com/addyosmani/recorder
Revision: dac533bba71308274fbf62bf3c116c6077193118 (main, 2025-02-20), MIT (LICENSE, copyright Contrast). This independent adaptation is not an official Record product or endorsement.

Record is a browser screen and camera recorder: screen only, screen with a camera bubble (picture-in-picture, round or square), camera only; a teleprompter; a countdown; WebM recording in the browser, with an optional WebM → MP4 conversion by ffmpeg.wasm. It keeps nothing: a finished recording is offered as a download.

This is the actual Record: `src/` is upstream's React app unchanged. Two additions:

- `index.html` loads `src/garden/boot.ts` beside the app's own entry; `src/garden/bridge.ts` is the Garden bridge. Inside a Crux the recording the modal offers as a download (Download (WebM); Convert (MP4) when the conversion works) is kept as an output of the Crux under `exports/` (a Cruxspace output OpenCut can use) named from the bar's Output name, and `data/project.json` lists the recordings with the Crux's name. Outside a Crux the app behaves as upstream.
- App Tools: `inspect_recordings`, `set_recorder_name`. Recording starts and stops by hand only.
- `vite.config.ts`: relative paths and `OUT_DIR=runtime` for the Workshop runtime.

Not carried over: the MP4 conversion needs cross-origin isolation (COOP/COEP headers) and downloads its ffmpeg core from unpkg; the Crux's preview server does not send those headers, so inside a Crux the conversion fails and WebM is the format (OpenCut takes WebM). The desktop app answers the screen picker with the primary screen (and the system picker on macOS 15+).

Build: `npm install`, `npm run build:garden` → `runtime/`; `npm run check`; `npm run test:garden`.

# Rebuilding the curated Cardinal runtime

This is a modified Cardinal Mini build. The original engine remains Cardinal/Rack;
the Garden bridge adds patch inspection/loading and bounded parameter updates.
The DPF patch leaves playback activation to the instrument's explicit transport.
`cardinal.patch` also selects Cardinal host modules, Fundamental, the existing Mini
Bogaudio selection, and Valley Plateau. Other full-Cardinal collections are absent.

Build inputs and output SHA-256 hashes are in `provenance.json`. `submodules.txt`
records initialized submodule revisions (lines beginning `-` were not fetched).
Emscripten 3.1.27 was used on macOS with make, CMake, autoconf, automake and pkg-config.
The following recipe requires fresh scratch directories and downloads upstream code.
Set `CARDINAL_SOURCE` to a new scratch checkout, `EMSDK` to an Emsdk installation,
and `GARDEN_ENGINE` to this directory before running it.

```sh
git clone https://github.com/DISTRHO/Cardinal.git "$CARDINAL_SOURCE"
cd "$CARDINAL_SOURCE"
git checkout 0a530b73273afc914ec71a78e9165cd28c53b599
git submodule update --init --recursive dpf src/Rack plugins/Fundamental plugins/BogaudioModules plugins/ValleyAudio deps/QuickJS
git apply "$GARDEN_ENGINE/cardinal.patch"
git -C dpf apply "$GARDEN_ENGINE/dpf.patch"
cp "$GARDEN_ENGINE/GardenBridge.inc" src/GardenBridge.inc
ln -s ../GardenBridge.inc src/CardinalMini/GardenBridge.inc
"$EMSDK/emsdk" install 3.1.27
"$EMSDK/emsdk" activate 3.1.27
. "$EMSDK/emsdk_env.sh"
export AR=emar CC=emcc CXX=em++ NM=emnm RANLIB=emranlib STRIP=emstrip
make -j6 USE_GLES2=true STATIC_BUILD=true NOPLUGINS=true deps
make -j6 USE_GLES2=true STATIC_BUILD=true dgl
make -C plugins -j6 USE_GLES2=true STATIC_BUILD=true plugins-mini.a
make -C src -j6 USE_GLES2=true STATIC_BUILD=true rack.a
make USE_GLES2=true STATIC_BUILD=true mini-resources
make -C src/CardinalMini -j6 USE_GLES2=true STATIC_BUILD=true
cp bin/CardinalMini.js bin/CardinalMini.wasm bin/CardinalMini.data "$GARDEN_ENGINE/../runtime/"
```

This recipe records the development build; a clean rebuild has not yet been
verified byte-for-byte. Source archives and a completed per-asset license review
are still required before public binary distribution. Upstream license inventories
are preserved in `../licenses/`, including artwork terms distinct from code terms.
Local development and a working instrument do not establish release clearance.

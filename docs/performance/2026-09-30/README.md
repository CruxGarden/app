# Packaged desktop measurements — September 30, 2026

Except for the Windows rendering section below, measured on macOS 26.6.2 (25G83), Apple M3 Pro, 36 GiB RAM. This is a shared
development machine, not a controlled benchmark host. Other applications were
left running. Do not generalize these timings to every supported machine.

## Startup

`packaged-startup.json` contains three fresh-profile launches and three restarts
of the same respective Gardens. Each starts a new process; OS filesystem caches
were **not** purged. The ad-hoc arm64 package was built from app `78e5bf4f8`,
with API `c5670cc`. Playwright uses isolated profiles and fixture credential
encryption, while the packaged app keeps its production privilege policy.

- Gateway visible: 1.319–1.439 s across all six launches.
- Fresh Garden creation/onboarding after Gateway: 3.720–4.001 s.
- Existing Garden entry after Gateway: 0.865, 0.865 and 3.191 s.

These measurements include automation and initialization, not time to load a
large project. Process working-set samples are also retained. Summing them can
double-count shared pages; they are not a measurement of private RAM.

## 50,000-file workload

The fixture contains 50,000 unique nested Markdown files of about 1 KB each.
The test checks every path/fingerprint, opens a file in Monaco, verifies tree
virtualization, marks Growth, exports, and imports into a fresh isolated Garden.
It compares all imported fingerprints, sampled physical file bytes and the
Growth label. Empty `.keep` directory placeholders are excluded from fixture
file counts; user files are not excluded.

`packaged-50000-before-import-fix.json` records app `78e5bf4f8` / API `c5670cc`:

| Phase                                         |                                                    Seconds |
| --------------------------------------------- | ---------------------------------------------------------: |
| Write external fixture                        |                                                      8.393 |
| Wait for complete ingestion and verify hashes |                                                    293.670 |
| Browse/open Monaco                            |                                                      3.579 |
| Mark Growth                                   |                                                     14.903 |
| Export                                        |                                                     63.448 |
| Fresh import                                  | **Failed: exceeded 300-second visible-workspace deadline** |

The failed test took 14.8 minutes including teardown. The 500-second ingestion
allowance measures integrity and actual duration; it is not a latency target.
The archive remains scratch output and is not checked into Git.

The import failure led to API `fc0fff4`: immutable import payloads now stage in
batches of at most eight. Started writes drain before failure releases the
transaction. Payload hashes, durable read-back and final complete-graph checks
remain. Two regressions fail before the change, then pass; the full API gate
passes 1,122 unit tests, 338 integration tests and local-runtime smoke, with five
existing scoped skips. App `6bcf4871c` bundles that runtime. The refreshed clean-source package passes
actual SQLite/CLI/native-tools smoke (1/7.5 s). Re-importing the **same archive**
into a fresh Garden passes in **273.588 s (4 min 34 s)**, including every
fingerprint, sampled physical bytes and Growth. See
`packaged-50000-import-after.json`. This is a focused import rerun, not a second
complete ingestion/export journey. No exact speedup percentage is claimed
because the earlier import exceeded its deadline. At this size, both bulk
ingestion and import still take several minutes.

## Durable-write microbenchmark

`durable-write-microbenchmark.json` measures 500 distinct payloads through the
actual native Blob Store, three trials per width. Serial writes took
3.180–3.399 s; batches of eight took 1.512–1.767 s. Atomic publication and fsync
remain enabled. This informed bounded staging; it does not establish the same
speedup for ingestion or archive import.

## Electron package composition

`electron-package-composition.json` measures logical non-symlink file bytes in
the earlier arm64 package at source `20c01c247`: 985.9 MiB total, of which
frameworks are 286.1 MiB (29.0%) and resources 699.4 MiB. This is not compressed
download size. Removing all frameworks is only an upper bound before adding
a replacement host and Node runtime. No Tauri RAM/startup improvement has been
measured. The exploratory review and current recommendation are in ROADMAP.

## Reproduction

Use Node from `app/electron/.nvmrc` and run one measured suite at a time from
`app/electron`, without concurrent builds. Set `CRUX_PACKAGED_APP` to the built
executable and `CRUX_PERF_OUT` to a scratch results directory.

```sh
CRUX_PACKAGED=1 npx playwright test -c playwright.performance.config.ts performance/startup.spec.ts
CRUX_PACKAGED=1 CRUX_PERF_FILES=50000 npx playwright test -c playwright.performance.config.ts performance/project-scale.spec.ts
```

To isolate an import change, set `CRUX_PERF_IMPORT_ARCHIVE` to a prior export
from the same fixture count. That mode still checks the complete expected file
inventory, sampled physical bytes and Growth; it does not repeat ingestion.
Do not report it as a new complete export/import run.

## Sustained-memory investigation

The first intended hour-long run was interrupted after 18.5 minutes because
retained JS grew from 28.34 to 35.99 MiB after forced GC. This is a reproduced
finding, **not** a passed sustained-memory result. Raw checkpoint samples are in
`memory-interrupted-before-fix.json`. Two additional heap snapshots captured
during that diagnostic locate 63,873 then 76,195 retained anonymous callbacks at
`AnimatedBackground.tsx`'s same-value functional state updater, 160 seconds
apart. Heap snapshots stayed in scratch storage; the small derived evidence is
in `background-retention-diagnostic.json`.

App `c13311841` fixes the owner: unrelated animated root-style changes no longer
read computed background style or enqueue a React update. A changed background
selection or theme class still updates the visible background. The real
renderer regression drives 30,000 unrelated style mutations: retained growth
falls from 2,721,808 bytes (failed) to 33,008 bytes (passed), with Blank/Bloom,
class override and rapid return behavior checked. The test takes 8.6 s after the
fix versus 1.8 min before, including setup/teardown; this is an accelerated
regression, not a claim that every interaction is proportionally faster.

Full app gate: 1,634 tests / 256 files, 18 scoped skips and build. Electron:
76 tests / one Windows-only skip. Four desktop journeys covering background
lifetime, Garden Mood, CLI and keyboard pass in 44.0 s. The rebuilt clean-source package at `901195588` passes actual SQLite/CLI/native-tools smoke (1/7.4 s) and the accelerated regression (1/6.6 s), retaining only 1,336 bytes. The ordinary repeat now passes **61.95 minutes** with 60 one-minute dwell/switch cycles and a further minute after closing the workspaces. No audio/Flow suppression is used; only speaker output is muted.

`packaged-memory-hour-after.json` preserves all 67 checkpoints. Mean retained JS is **28.67 MiB in the first ten cycles** and **29.37 MiB in the last ten**, compared with the previous rapid continuous growth. The last cycle is 29.42 MiB; 60 seconds after pausing sound and closing all three workspaces it is 29.43 MiB. Workspace DOM nodes fall from 501 to 484 and listeners from 517 to 500; the post-close samples remain steady. This supports bounded retention in this workload, not a claim that the whole app is leak-free or that all memory returns to the initial baseline.

Switching and checking each saved draft takes **222.5 ms median, 256 ms p95, 284 ms maximum**. The main renderer's sampled working set rises from 429.9 MiB at warmup to 497.5 MiB at the last cycle and settles to 494.1 MiB after closing; this is not private RAM and is not identical to retained JavaScript. The test asserts draft continuity and no renderer errors; memory conclusions come from the recorded measurements and the separate accelerated regression.

Reproduce with `CRUX_PACKAGED=1 CRUX_MEMORY_CYCLES=60 CRUX_MEMORY_DWELL_MS=60000 npx playwright test -c playwright.performance.config.ts performance/workspace-memory.spec.ts`, setting the executable and output directory as above.

## Windows software rendering

Native run36761648753 at app `b2783d5dd` reports Microsoft Basic Render Driver,
software compositing/rasterization and unavailable/software WebGL. The same
Home, sampled for30 animation frames per phase, isolates the Plasma material:

| Phase           | Median frame | Sample elapsed |
| --------------- | -----------: | -------------: |
| Ordinary Plasma |     890.6 ms |       28.814 s |
| Plasma off      |      15.6 ms |        0.469 s |
| Plasma restored |     890.6 ms |       28.319 s |

`windows-rendering-before.json` retains GPU details, frame timestamps, CDP
metrics and process samples from artifact11120875546. ScriptDuration is2.021 /
0.002 /2.186seconds; LayoutDuration is0 in all three phases. The actual graphics
fallback is required; increasing test deadlines would leave an unusable app.

The browser capability probe uses WebGL's
[`failIfMajorPerformanceCaveat`](https://registry.khronos.org/webgl/specs/latest/1.0/#5.2)
attribute and releases its temporary context. A refusal selects Glass for a
requested Plasma workspace and a static branded entry panel. Saved appearance
choices remain untouched. Hardware-capable entry/workspace rendering continues
normally. Unit and injected-refusal desktop tests establish the policy; the
native Windows run36768996887 at `31a6fc113` confirms the fallback selects Glass.
`windows-rendering-after.json` preserves the raw artifact11123531210. The same
ordinary/off/restored samples take2.053/0.632/2.163seconds, with median frame
intervals78.05/15.6/78.1ms. This is substantially improved but still slower than
solid rendering; it is not a60fps claim.

Linux acceptance passes. Windows passes7 of8 checks, including CLI,
create/version/publish, keyboard and packaged SQLite/native-tools smoke. Fresh
Garden entry takes3.694–4.047seconds. The remaining folder-authorization test
compares short (`RUNNER~1`) and long (`runneradmin`) spellings of one directory.
Canonicalizing both sides with native realpath fixes the assertion; the full
Electron gate passes76 tests with one platform skip, and the focused macOS
root-switch/restart test passes in13.4seconds. The next Windows run must confirm
that final test correction; these results do not yet claim a fully green Windows gate.

The follow-up native run [36771713583](https://github.com/CruxGarden/app/actions/runs/36771713583) at `bdf644b97` passes **8/8 Windows and 8/8 Linux checks**, each in1.3minutes. Both include actual packaged startup, SQLite, bundled CLI and native tools, folder-root switch/restart, IPC security, ordinary creation/versioning/publication and keyboard access. Artifacts11124373926 (Windows) and11124159748 (Linux) retain diagnostics. This closes the recorded path-assertion failure. It predates the welcome-walkthrough feature, whose native CI rerun is tracked separately.

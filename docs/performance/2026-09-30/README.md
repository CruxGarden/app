# Packaged desktop measurements — September 30, 2026

Measured on macOS 26.6.2 (25G83), Apple M3 Pro, 36 GiB RAM. This is a shared
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
lifetime, Garden Mood, CLI and keyboard pass in 44.0 s. A rebuilt packaged
one-hour repeat remains pending. No audio/Flow suppression is used.

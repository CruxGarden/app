# Baseline: September 10, 2026

Apple M3 Pro, 36 GiB RAM, macOS arm64. App production code is the
`clean-workshop-creation` baseline (`6e103b7`); this branch adds tests and reports.
One complete matrix per backend, plus targeted desktop reproductions. These are
observations on this machine, not guaranteed latency targets or statistical
medians across machines. No production optimization was made in this change.

## In-memory storage suite: all three cases passed

Node 22.19.0, existing sql.js SQLite adapter and Map Blob Store. This measures
production service/format code but does not include native disk or IPC overhead.
Each case uses 1 KiB unique notes, three snapshots, and two rounds changing 1%.

| Files  | Create records | Build folder tree | Snapshot file records (range) | Export | Fresh-store import |
| ------ | -------------: | ----------------: | ----------------------------: | -----: | -----------------: |
| 1,000  |         0.24 s |              2 ms |                 0.044–0.054 s | 0.08 s |             0.23 s |
| 10,000 |        10.28 s |             11 ms |                 0.451–0.465 s | 0.71 s |             2.35 s |
| 50,000 |       249.49 s |             55 ms |                 2.345–2.445 s | 4.54 s |            12.80 s |

At 50,000 notes the three snapshots plus current state have 200,000 file
references and 51,000 unique content blobs. The database export is 152,698,880
bytes and the `.crux` archive is 104,531,238 bytes. All current/historical
path/fingerprint pairs survived fresh import; sampled content matched. File
creation scales much worse than file count in this baseline; the measurements
do not by themselves identify the responsible operation.

Full observations: `storage-1000.json`, `storage-10000.json`, `storage-50000.json`.
Memory fields are process endpoints, not peak measurements. They include the
test fixtures and retained test data, and cases share a test worker.

## Native desktop: one case passed, two failed

Node runner 24.14.0, built Electron app, isolated native database/Blob Store and
Project Folders. Each case starts by importing the service-generated unversioned
archive, independently of the external-write burst test.

| Files  |                    Initial import to workspace | Browse/open                           | Snapshots   |      Export | Fresh-garden import |
| ------ | ---------------------------------------------: | ------------------------------------- | ----------- | ----------: | ------------------: |
| 1,000  |                                         1.94 s | 1.26 s                                | 0.39–0.92 s |      1.37 s |              2.47 s |
| 10,000 |                                        17.17 s | **Failed: no notes tree within 60 s** | Not reached | Not reached |         Not reached |
| 50,000 | **Failed: workspace not reached within 180 s** | Not reached                           | Not reached | Not reached |         Not reached |

The 10,000-file case verified all expected path/fingerprint pairs in SQLite
before attempting to browse. The Artifacts pane stayed blank in the failure
screenshot. That does not establish a root cause in the tree component itself.
The targeted repeat reproduced the same blank pane after a 16.74-second import
(`desktop-archive-10000-repeat.json`, `desktop-10000-blank.png`). Renderer error
capture only recorded a resource 404, also seen in the separate burst run;
it does not explain the blank pane.
The 50,000-file failure screenshot showed the import dialog still busy at 100%.
The completed 1,000-file journey verified every restored note path on disk,
current/historical fingerprints, and sampled actual file contents in a second
fresh garden; only 31 tree rows were rendered in its browse check.

Reports: `desktop-archive-1000.json`, `desktop-archive-10000.json`,
`desktop-archive-50000.json`. Their memory fields sum sampled working sets across
Electron processes; shared pages may be counted more than once. These are
whole-app observations, not incremental memory per file or precise heap peaks.

## External-write burst: failing regression

With a proven live watcher, write 1,000 notes into new nested directories at
once. The final reproduction indexed **856/1,000** within a 30-second deadline;
all 1,000 had been written on disk. An earlier run with a 180-second deadline
stalled at **887/1,000**. The different missing-file counts are part of the
observed failure, not a stable expected count. The test always requires all
1,000; it does not mark this failure expected or repair the index behind the UI.

Report: `desktop-burst-1000.json`. Larger burst cases are available but were not
run to completion after the 1,000-file failure was reproduced. The source
storage suite and native archive mode remain separate so this failure cannot
be mistaken for a limitation of the portable format itself.

## Follow-up priorities

1. Investigate reconciliation of large external directory additions: Artifacts
   missing from the index cannot be relied on to appear in Growth or exports.
2. Investigate the blank workspace/Artifacts pane after the 10,000-file import,
   and the unfinished 50,000-file desktop import. Preserve the tests' UI
   completion checks; a database count alone does not prove usability.
3. Profile per-file creation and metadata cloning, then optimize/batch the
   expensive operations. Re-run this same workload to compare changes.

Ordinary app verification (822 tests, typecheck, lint, build), Electron
verification, and performance-test type/lint checks passed. The opt-in desktop
performance suite is **not green**; its failures are the findings of this work.

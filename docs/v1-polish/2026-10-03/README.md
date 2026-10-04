# V1 desktop polish sweep — October 3

This pass reviews the existing desktop creation → collaboration/editing → Growth → sharing loop, Home, Tasks, Settings, Moods, navigation and recovery. It fixes reproduced friction while preserving existing behavior tests. It is not an exhaustive audit of every command in every embedded editor.

## Changes

- Composer attachments use the existing guarded batch writer. Replacement asks first; partial failures name the outcome; files, outside edits and the unsent message survive. Completion offers **Show files** and returns focus to the composer.
- Collaboration and Garden conversations preserve the reader's position while replies stream. **Latest reply** resumes following. IME candidate confirmation does not send either composer prematurely.
- Share distinguishes a saved Discoverable preference from the confirmed online listing. Failed updates remain visible and retryable after reopening. Unshare refuses an unavailable domain/visitor-data impact review, and retains the original account and Crux through confirmation.
- Domain loading and clipboard failures are explicit. Invalid-domain guidance works with sanitized API errors, without exposing server response bodies.
- Task models use their readable names. Memory explains its scope and provider route concisely, with external editing details folded away.
- Memory's promised `memory.md` file now uses dedicated, fixed-file native commands. The Garden Root remains outside Project Folder grants. Reviewed writes refuse outside edits, links and oversized files; Settings retains the unsaved draft and confirms reload. See root ADR0079.

- Metrics report append also uses dedicated native authority, preserving nested report destinations and prior entries while refusing unrelated files, links and Project Folder targets. Busy and failure states are explicit; Copy and Reset remain available. See root ADR0080.

## Evidence

`evidence.json` records exact acceptance results and remaining boundaries. New actual Electron tests are `composer-files`, `composer-keyboard`, `conversation-reading`, `share-feedback` and `memory-file`. Existing Memory, agent-metrics and usage/domain journeys retain their expected outcomes; their navigation helpers now use the current panel controls. Native Memory filesystem and untrusted-renderer tests supplement the UI journeys.

Local acceptance: app verify passes1,830 tests across292 files (18 existing skips), native verify99 (one platform skip), and five checks against the fresh Mac package. The128-case desktop sweep passed127; an instrumented permission-fixture failure showed its replaced iframe never received the click. Moving the pointer off the discarded surface preserves the real click and all consent assertions; both permission cases passed ten repeats (20 checks). This is recorded as a broad run plus a verified correction, not an all-green original run.

The familiar manual-testing launcher now selects `manual-testing-polish-oct3`. Its user profile remains empty and unopened; automated checks use isolated temporary profiles. The refreshed story game has128 stories and1,266 criteria. Shipping-source native CI passes on Windows and Linux, with25 desktop/package checks each (Linux99 native checks/one skip; Windows96/four skips). Exact CI and package identity are in the evidence ledger.

Screenshots here show the actual desktop app, including interrupted operations. The scratch visual review additionally inspected Gateway/Home, creation, editing, Growth/Tasks, Share, all six Settings sections and Moods. The manual story game appends six criteria without replacing prior progress IDs.

Live AI quality, credentials, billing/email/hosting, optional catalog publication, signed installers and update delivery remain separate launch acceptance. The user's zero-state manual profile is not used by automated checks. Existing dependency advisories and the broader storage-retirement work remain documented separately.

# V1 desktop polish sweep — October 3

This pass reviews the existing desktop creation → collaboration/editing → Growth → sharing loop, Home, Tasks, Settings, Moods, navigation and recovery. It fixes reproduced friction while preserving existing behavior tests. It is not an exhaustive audit of every command in every embedded editor.

## Changes

- Composer attachments use the existing guarded batch writer. Replacement asks first; partial failures name the outcome; files, outside edits and the unsent message survive. Completion offers **Show files** and returns focus to the composer.
- Collaboration and Garden conversations preserve the reader's position while replies stream. **Latest reply** resumes following. IME candidate confirmation does not send either composer prematurely.
- Share distinguishes a saved Discoverable preference from the confirmed online listing. Failed updates remain visible and retryable after reopening. Unshare refuses an unavailable domain/visitor-data impact review, and retains the original account and Crux through confirmation.
- Domain loading and clipboard failures are explicit. Invalid-domain guidance works with sanitized API errors, without exposing server response bodies.
- Task models use their readable names. Memory explains its scope and provider route concisely, with external editing details folded away.
- Memory's promised `memory.md` file now uses dedicated, fixed-file native commands. The Garden Root remains outside Project Folder grants. Reviewed writes refuse outside edits, links and oversized files; Settings retains the unsaved draft and confirms reload. See root ADR0079.

## Evidence

`evidence.json` records exact acceptance results and remaining boundaries. New actual Electron tests are `composer-files`, `composer-keyboard`, `conversation-reading`, `share-feedback` and `memory-file`. Existing Memory and usage/domain journeys retain their expected outcomes; their navigation helpers now use the current panel controls. Native Memory filesystem and untrusted-renderer tests supplement the UI journeys.

Screenshots here show the actual desktop app, including interrupted operations. The scratch visual review additionally inspected Gateway/Home, creation, editing, Growth/Tasks, Share, all six Settings sections and Moods. The manual story game appends six criteria without replacing prior progress IDs.

Live AI quality, credentials, billing/email/hosting, optional catalog publication, signed installers and update delivery remain separate launch acceptance. The user's zero-state manual profile is not used by automated checks. Existing dependency advisories and the broader storage-retirement work remain documented separately.

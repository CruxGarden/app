# Novice onboarding and panel presentation

The first-run wizard chooses a useful starting project and opens its workspace. Normal mode introduces the next activity, keeps the everyday controls visible, and groups secondary controls in named sections. Advanced Mode opens those sections by default. AI is an independent choice. Switching presentation keeps the mounted controls and their drafts; it does not change publishing permissions or publish anything.

## Panel contract

Every entry in `src/components/workspace/paneConfig.ts` requires explicit `layouts.normal` and `layouts.advanced` definitions. The workspace consumes the selected profile, and each panel header offers contextual help. `PaneOptions` implements the profile's disclosure behavior without unmounting its children.

| Panel                                               | Normal presentation                                                                           | Advanced presentation                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Workshop                                            | Use the tool or edit the home-page form; workspace and preview tools folded                   | Source view offered; workspace and preview tools expanded                                            |
| Collaboration / Garden Collaboration                | Composer, conversation and approvals visible; model options folded                            | Model options expanded                                                                               |
| Artifacts                                           | Files and ordinary file actions visible; agent instructions folded                            | Agent instructions expanded                                                                          |
| Details                                             | Project identity first; project-specific settings folded                                      | Project-specific settings expanded                                                                   |
| Growth                                              | History and restore visible; branches and merges folded                                       | Branches and merges expanded                                                                         |
| Share                                               | Plain publishing steps and selected-content choices; optional staging and failure logs folded | Detailed controls expanded; failures stay visible in both modes                                      |
| Export                                              | Backup action visible; archive contents folded                                                | Archive contents expanded                                                                            |
| Sync                                                | Backup/restore actions with a plain explanation that neither publishes                        | Existing detailed backup controls retained                                                           |
| Tasks                                               | Task actions and outcomes visible; check logs folded                                          | Check logs expanded                                                                                  |
| Settings                                            | Everyday preferences visible; custom panel names, layouts and disk details folded             | Those sections expanded                                                                              |
| Mood                                                | Theme Customizer by default                                                                   | Full Theme Builder by default; explicit local choice retained                                        |
| Synth                                               | Playback and everyday settings visible; sound-preset editor folded                            | Sound-preset editor expanded                                                                         |
| Tending                                             | Ordinary schedules and actions; technical action creation hidden                              | Cron, tool and Function creation offered; existing drafts retained when switching                    |
| Store                                               | Not offered; an already-open panel explains Advanced Mode while retaining its controls        | Full Store controls available                                                                        |
| Garden Home / Explore / Navigator / browser / media | Primary browsing controls and contextual help                                                 | Same primary controls; these panels do not need extra technical controls solely to distinguish modes |

Notes continues to use one folder-hierarchy pane. Its embedded notebook bar places import/export actions under More notebook options. This is a host-panel presentation contract, not a claim that every upstream tool's internal controls have been redesigned.

## Guided first publication

- The recommended starter is immediately visible. Alternate templates and guidance levels are optional.
- Skip explains the destination; deferring AI says Set up AI later. Sign-in does not imply a paid plan was bought or AI is ready.
- The home-page walkthrough leads from an open editing form to preview and Share.
- The Notes walkthrough focuses the real editor, opens the public-note chooser, then leads to Share and Copy link. Visitor preview builds the selected public edition on the isolated local test server instead of displaying the notebook editor. Unchecked notes remain private; choosing notes does not publish them.
- Installation lockfile ingestion does not restart the live notebook editor while it is confirming a save. Actual editor source changes still reload it.
- First build dependency installation finishes before capturing the publication source baseline. A generated lockfile no longer makes a successful first publication appear immediately out of date. Changes made during or after the build still count as unpublished edits.

The Gateway Enter button uses the standard Mood icon/hover color pair, keeping the plus visible instead of forcing the accent color on top of the hover fill.

## Acceptance

Final results and limits are recorded in `acceptance.json`. Native journeys use isolated Gardens and a local mock account/upload API; the production publishing service is not exercised by these tests. This is implementation and automated/visual acceptance, not a usability study with novice participants.

## Visual evidence

- [Wizard ready step](novice-ready.png)
- [Guided first notebook](novice-first-notebook.png)
- [Published notes and copy link](novice-published-notes.png)
- [Selected public edition preview](notes-visitor-preview.png)
- [Home-page editing form](home-page-editing.png)
- [Advanced panel controls](advanced-panels.png)
- [Entry-button hover check with monochrome Mood tokens](entry-hover.png)

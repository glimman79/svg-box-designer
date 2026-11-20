# Stage C — Global Undo/Redo and reversible workspace navigation

PR 7 merged in #643. The user verified Line restoration and changed the navigation policy on November 20, 2026. PR 8 is based on verified GitHub main `22d9323db0e2965f9dedbdcf94e7c933cae3aa7f`. PR #644 merged at `691a4dfaa4e130ca344e37f5220484cb10ddeb2d` and the user verified reversible workspace navigation.

## One publication per accepted action

App creates one `createGlobalProjectHistory` above both mounted workspaces. Its private `projectOwner` owns the frozen Drawing and BOX records. The pure `projectHistory` core owns the past and future transitions. The runtime publication pairs the owner's exact project root with the core result, active workspace, revision, interaction epoch and session identity. The owner installs the prepared position before notifying any subscriber. React subscribes to that publication through `useSyncExternalStore`. Even an Undo and Redo that return to the same root between renders produce a new observable publication.

Drawing stages complete accepted documents or groups of mutations. Nested rejection discards the outer candidate. BOX prepares a complete candidate from the live owner, including automatic next connections, role changes and trailing cleanup in the originating action. The adapters reuse the immutable result. Both can read an immediately preceding commit in the same event. A change to the observed revision during preparation prevents the stale candidate from publishing.

The service admits the structure of both supported in-memory workspace projections before publication. The owner freezes their shared records. Weak maps associate admitted frames with their owner roots and BOX projections. Traversal requires an admitted root. An unavailable transition or missing admitted target leaves the current publication intact. Domain validation still belongs to the existing Drawing commands, parser, Panel Manager and construction workflows. This boundary accepts in-memory domain data and introduces no native file format.

## Traversal, retention and navigation

One Undo or Redo crosses exactly one entry. A project edit records its module, ID, label and a complete frame. A navigation entry records `{kind: 'navigation', source, destination}`. The runtime publishes the source on Undo and the destination on Redo. It reuses the current immutable frame and owner root, even if BOX selection has changed since the switch. Navigation never calls the project-edit transaction or snapshot factory.

Project-edit traversal activates the originating workspace and reinstalls the complete previously accepted root by identity. That includes every Sketch and its topology, constraints, dimensions, annotation placements and solved Circle/Arc geometry. BOX includes original SVG text, parsed panels/holes/edges, all assignments and groups, workflow order, Panel Manager flags, current and last-applied manufacturing settings, recorded operations, output, composition marker and timestamp. Assignment target, displayed connection and selected edge retain their distinct values, including explicit null. Derived contours and the preview can render again from these records.

The existing 30-transition core bounds the combined Undo and Redo stacks to 30. At capacity the user can reach 31 states. Undo/Redo transfer a transition between stacks. Each new accepted edit or deliberate Drawing/BOX switch discards the abandoned Redo branch. A repeated or unavailable workspace selection, preview, cancellation or automatic activation preserves Redo. The service reads the source workspace at command time. React reads the runtime publication directly. The UI finishes publishing and updating command availability before the next DOM command can run in the same browser task. BOX edge inspection and workflow navigation can update the three restoration-context IDs on the current position while sharing both stacks and all authored data.

Opening Manufacturing shows its workflow row immediately. Its initial order is a view preference until the first accepted manufacturing setting edit records it with the edit. New groups respect the visited row's position. Source changes and session reset clear the temporary row. The shared bottom History region continues to reveal workflow groups. The old 100-step Drawing utility is only used for isolated domain tests. The mounted workspace has no local stack, module-specific traversal command or published history controller. The old BOX 10-step stack, partial snapshots and restore setters are removed.

## Interaction boundaries

- App owns the toolbar commands and the single application history key listener. Ctrl/Cmd+Z undoes, Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z redo. Inputs, text areas, selects and editable text retain native Undo. Drawing still handles Delete/Backspace for its selected geometry, constraints and dimensions. The import lock has capture-phase priority. The listener is removed on unmount.
- App settles an accepted pending Profile click before traversing history or leaving Drawing. Settlement consumes its timer and commits the captured placement once. A pending first point establishes a continuation. A pending segment becomes one reversible edit. Leaving Drawing then adds the switch as the next entry. Undo returns to Drawing with the segment present. The following Undo removes the segment. The toolbar accounts for a pending segment even on an otherwise empty tape. Rapid clicks retain same-event continuation. The established native double-click finish and explicit tool/Escape cancellations retain their semantics.
- Ordinary switches preserve unfinished Circle/Arc and Dimension authoring and discard active geometry or annotation drag previews. Global restore clears obsolete selections, previews, numeric editors, snap candidates and captured gestures. Geometry and annotation release handlers read their live session refs. Annotation cancellation releases the actual captured element. BOX numeric editors are keyed to the interaction epoch, and a physical BOX canvas click that started before restore cannot assign an edge on release.
- Each publication advances a non-rewinding revision. Traversal, source replacement and destructive reset invalidate the interaction epoch. Reset creates a fresh session identity. `getAttempt` and `isCurrent` compare session and revision independently of historical object identity. Import also checks its own owner identity, sequence and BOX revision. The lock remains held through file reading, parsing, synchronous publication and UI cleanup.

## Source, Apply and Clear

A successful changed SVG import is one BOX transition. Parsing happens once before admission. Existing connection definitions survive source replacement. Dependent assignments, groups, settings, Panel Manager and applied output take their normal import values. Undo and Redo restore both original sources and their accepted data without reparsing. A failed or superseded import preserves both stacks. The file input is reset on selection so the same file can be retried. Reimporting equivalent source and dependent data is a no-op.

Pending panel thickness, default acceptance, Panel Manager Apply, manufacturing settings and a changed Geometry Apply are independently reversible. Apply still validates and runs the existing generators. Exact equality of operations, output and metadata except the creation timestamp permits reuse of the previous snapshot. A change in an applied settings stamp can therefore create one step even when the preview already reflects the current draft value. No geometric tolerance was added.

Clear opens a native modal from Drawing or BOX. Cancel has initial focus. Cancel, Escape and backdrop dismissal keep the exact project root, history, cursor, Redo and session. Opening the dialog pauses an accepted Profile timer and preserves uncommitted numeric input. Cancel lets the pending interaction continue. **Save and Clear** is disabled with an explanation until native project saving can verify a complete editable save. SVG Export produces manufacturing output and cannot satisfy that requirement.

**Clear Without Saving** cancels pending gestures and calls `clearProject` for the session that opened the dialog. The service uses `createInitialProjectState` to prepare the complete Drawing and BOX baseline and starts a new empty history. A single publication installs the root, cursor, fresh session and advanced interaction epoch, and invalidates old import tokens before notifying subscribers. Undo cannot cross this boundary. The reset publication selects BOX / Construction with zero transitions. The new session remounts this default view, with initial tools, selections, viewports and manufacturing controls. Old timers, pointer releases and editor commits cannot edit the fresh project.

## Verification

The production-owner and adapter tests read the live owner and cursor together inside a subscriber. They check same-event edits, nested and stale rejection, immutable identity, all stored composition modes, branching after eviction, and unchanged Apply/import. The core, capture and separate CAD domain suites cover solver results, canonical Arc data, dimension roles, relationship removal, rejected PM/Wall/S operations and generated-output equivalence.

The dedicated Chromium suite observes the production service at Vite's module boundary and uses UI controls for every edit. It checks frame and root identity in both traversal directions, exact oldest reachability after mixed edits and switches, a branch from a partly consumed tape and the project-wide Clear dialog. It counts actual parser, TB/W/S generator, authority selector, snapshot factory and Dimension solver calls. All were exercised during authoring. None were invoked while traversing the tested mixed Apply/Dimension or SVG replacement frames. Additional mounted suites exercise input locking, pending Profile/timer and pointer release, Kerf and S Offset, group continuation and workflow navigation. A separate baseline-versus-branch Chromium check confirmed that native Profile double-click at a new endpoint completes one final segment and exits the tool.

### Historical PR 7 results

The Clear correction was applied to reviewed branch commit `5e8a64da4cd574d5d2a63c94f80993002b6e77aa` on 20 November 2026. Validation used Node 24.19.0 and Chromium 151.0.7922.173. At that checkpoint, all 30 non-browser npm commands, eight mounted Chromium suites and the diff check succeeded. The four suites that report individual project-history tests returned the following counts.

| Suite | Passed | Failed or skipped |
| --- | ---: | ---: |
| Pure project history | 40 | 0 |
| Complete state capture | 16 | 0 |
| Shared owner, BOX and global integration | 51 | 0 |
| Drawing transaction adapter | 8 | 0 |

The mounted global suite exercised A–E, I and J, including 34 alternating UI edits, all 30 reachable Undo transitions and six Redos before branching. The adapter retention test traversed all 30 transitions in both directions. The construction, Drawing adapter, project owner, import lock, workspace shell, shared History and contextual canvas suites also passed. Production adapter and mounted interaction checks together cover the rejected edits, rapid edits and pending interactions in F–H. The corrected Clear tests also compare the full reset with the canonical factory, check publication inside a subscriber, and compare history, cursor and session identities on dismissal. Chromium exercises the disabled save choice, focus restoration, pending Profile and numeric input, pointer release both during and after the dialog, a late SVG read during a new import, and fresh cross-module editing. Personal acceptance follows merge.

### Validation commands

Run from the repository with its dependencies installed. Browser suites use the running Vite server and Chromium.

```sh
npm test
npm run build
npm run test:project-history
npm run test:project-state
npm run test:project-owner
npm run test:drawing-transaction-adapter
npm run test:drawing-history-transactions
npm run test:drawing-history-controls
npm run test:shared-history
npm run test:workspace-shell
npm run test:box-empty-start
npm run test:mixed-edge-authoring
npm run test:generated-geometry-authority-restore
npm run test:generated-geometry-authority-mixed
npm run test:drawing-constraint-rank
npm run test:drawing-profile-production-boundary
npm run test:wall-v2-restore
npm run test:s-shared-reference-edge
npm run test:s-slot-offset-orientation
npm run test:d2-1b
npm run test:d2-3a
npm run test:drawing-line-tool
npm run test:drawing-constraints-tool
npm run test:drawing-direct-manipulation
npm run test:drawing-dimension-interaction
npm run test:drawing-circle-direct-manipulation
npm run test:drawing-arc-direct-manipulation
npm run test:drawing-arc
npm run test:drawing-dimension-role
npm run test:drawing-dimension-solver
npm run test:cad-interaction-contract
git diff --check
```

```sh
npm run dev -- --host 127.0.0.1 --strictPort
# In a second terminal
npm run test:global-project-history:browser
npm run test:workspace-shell:browser
npm run test:shared-history:browser
npm run test:project-owner:browser
npm run test:box-construction:browser
npm run test:drawing-transaction-adapter:browser
npm run test:svg-import-lock:browser
npm run test:contextual-canvas-controls:browser
npm run test:compact-workspace-settings:browser
node tests/drawing-arc-direct-manipulation.browser.cjs
node tests/drawing-coincidence-drag.browser.cjs
```

### PR 7 memory and timing

The cutover shares frozen module subtrees. BOX-only changes retain the complete Drawing document. Drawing edits retain the complete BOX projection. The cache keys are weak, and dev-only Apply diagnostics expire with their input. Permanent construction definitions have no history quota.

On the original reviewed commit, after the owner suite compiled its production fixture, the isolated measurement ran with `node --expose-gc --test tests/global-project-history.test.cjs`. All three tests passed. The two-Sketch fixture extended the source by 2 MiB and held 5,000 stored output records.

| Measurement | Observed result |
| --- | ---: |
| 64 alternating accepted edits | 9.90 ms total |
| 30 Undos followed by 30 Redos | 0.60 ms total |
| Heap growth from baseline to 30 retained transitions | 443,616 bytes |

The test checks sharing, module activation and every retained frame identity. The heap delta is measured after explicit garbage collection, relative to the admitted baseline. This sample includes test assertions and a subscriber. It measures in-memory execution. Rendering latency, native memory and a workload with 30 unrelated large imports remain unmeasured.

## PR 8 validation (November 20, 2026)

The 31 non-browser npm commands listed above passed with Node 24.19.0, including the production build. `git diff --check` passed. The pure core suite passed 40 tests, state capture 16, owner/BOX/global integration 53, and the Drawing transaction adapter 8. The workspace shell passed 5 tests and shared History passed 2. The other commands include single-harness processes and report their own results.

Ten of eleven mounted Chromium suites passed on Chromium 151.0.7922.173. All eight PR 7 suites passed, including the exclusive import lock and project-wide Clear. The additional Arc manipulation suite passed 23 scenarios and Coincidence drag passed 10. The compact workspace settings suite failed the same layout assertion on this branch and on the verified baseline. At 1024 pixels wide, the Normal Drawing toolbar took two rows where the test expects one. To reproduce the baseline comparison, serve the baseline on port 5174 and run `WORKSPACE_BROWSER_URL=http://127.0.0.1:5174 npm run test:compact-workspace-settings:browser`.

The global Chromium suite records frame and owner identity, tab state and cursor depth. It traverses the Line → switch → import → Panel Manager → TB assignments sequence in both directions. It exercises 68 mixed transitions through 30 Undos and 30 Redos, same-task clicks and keyboard commands, and an edit immediately after traversal. Mounted instrumentation counts calls to the parser, generators, authority selector, snapshot factory and Dimension solver. The counters stayed fixed during the measured navigation and restoration sequence.

After compiling the owner fixtures, `node --expose-gc --test tests/global-project-history.test.cjs` passed all six tests. With a 2 MiB source extension and 5,000 stored output items, 10,000 alternating switches took 7.12 ms and 60 traversals took 0.18 ms in one Node run. The live heap increased by 25,912 bytes after explicit GC with 30 transitions retained. Every traversal reused the same frame and owner root. The heap delta includes runtime and measurement overhead. Browser paint latency, native allocations and projects with many distinct large imports were unmeasured.

## USER TESTING / USER-VISIBLE CHANGES

1. In Drawing, create a Line. Switch to BOX, import the two-panel fixture, accept default thickness, Apply, then OK. Start TB and click one edge on each panel. [Two-panel fixture](../tests/fixtures/construction-two-panels.svg)
2. Undo the assignments, group, Panel Manager changes and import. The next Undo opens Drawing with the Line still visible. One more Undo removes it. Redo restores the Line, then opens BOX, then restores the import and construction edits in order.
3. Undo a switch. Click the active tab and check that Redo stays available. Click the other supported tab and check that Redo clears. Switch several more times and undo them individually.
4. In Drawing, click two points with Profile and immediately switch to BOX. Undo once to see the accepted segment. Undo again to remove it.
5. Apply a completed TB/W/S construction in Manufacturing and compare the preview before and after Undo/Redo. Import a different SVG, then undo the import. The previous source and its applied output should return together. Redo should restore the replacement.
6. Open Clear with a Redo available. Cancel or press Escape and redo the action. In a disposable project choose Clear Without Saving. BOX opens empty with Undo and Redo disabled. Switching to Drawing now creates the first step of the new session. Save and Clear stays disabled pending native Save.

At the PR 8 checkpoint, Drawing-to-BOX transfer, permanent Sketch operations and UI-4 remained future work. C.2 PR 1 subsequently added Sketch operations to the captured frame. The bottom History row continues to show BOX workflow groups and the Drawing availability message. The previously accepted rare Arc empty/blind Undo limitation remains open. [Sketch operation contract](SKETCH_OPERATION_FOUNDATION.md)

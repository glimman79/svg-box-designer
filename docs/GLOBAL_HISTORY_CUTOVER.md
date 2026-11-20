# Stage C PR 7 — Global Undo/Redo

Review branch based on GitHub main `7be80ccf5f97009a745e2f4866870c00ffe37654`, verified on 19 November 2026. #642 is merged. The user verified its TB and S continuation, invalid Wall mate with preserved Redo, and negative numeric input. The global cutover awaits review, merge and separate user acceptance.

## One publication per accepted edit

App creates one `createGlobalProjectHistory` above both mounted workspaces. Its private `projectOwner` owns the frozen Drawing and BOX records. The pure `projectHistory` core owns the past and future transitions. The runtime publication pairs the owner's exact project root with the core result, revision, interaction epoch and session identity. The owner installs the prepared position before notifying any subscriber. React subscribes to that publication through `useSyncExternalStore`. Even an Undo and Redo that return to the same root between renders produce a new observable publication.

Drawing stages complete accepted documents or groups of mutations. Nested rejection discards the outer candidate. BOX prepares a complete candidate from the live owner, including automatic next connections, role changes and trailing cleanup in the originating action. The adapters reuse the immutable result. Both can read an immediately preceding commit in the same event. A change to the observed revision during preparation prevents the stale candidate from publishing.

The service admits the structure of both supported in-memory workspace projections before publication. The owner freezes their shared records. Weak maps associate admitted frames with their owner roots and BOX projections. Traversal requires an admitted root. An unavailable transition or missing admitted target leaves the current publication intact. Domain validation still belongs to the existing Drawing commands, parser, Panel Manager and construction workflows. This boundary accepts in-memory domain data and introduces no native file format.

## Traversal, retention and navigation

One Undo reverses the latest accepted edit. One Redo reapplies the next edit. The traversed transaction identifies its workspace through a single mapping from `drawing` to Drawing and `box` to Construction. App activates it through the existing workspace selector. Puzzle stays disabled.

Both directions reinstall the complete previously accepted root by identity. That includes every Sketch and its topology, constraints, dimensions, annotation placements and solved Circle/Arc geometry. BOX includes original SVG text, parsed panels/holes/edges, all assignments and groups, workflow order, Panel Manager flags, current and last-applied manufacturing settings, recorded operations, output, composition marker and timestamp. Assignment target, displayed connection and selected edge retain their distinct values, including explicit null. Derived contours and the preview can render again from these records.

The existing 30-transition core bounds the combined Undo and Redo stacks to 30. At capacity the user can reach 31 states. Undo/Redo transfer a transition between stacks. A new accepted edit discards the undone branch. Reject, cancel, preview, equivalence and workspace switching leave both stacks intact. Ordinary workspace switches do not read or capture a frame. BOX edge inspection and workflow navigation can update the three restoration-context IDs on the current position while sharing both stacks and all authored data.

Opening Manufacturing shows its workflow row immediately. Its initial order is a view preference until the first accepted manufacturing setting edit records it with the edit. New groups respect the visited row's position. Source changes and session reset clear the temporary row. The shared bottom History region continues to reveal workflow groups. The old 100-step Drawing utility is only used for isolated domain tests. The mounted workspace has no local stack, module-specific traversal command or published history controller. The old BOX 10-step stack, partial snapshots and restore setters are removed.

## Interaction boundaries

- App owns the toolbar commands and the single application history key listener. Ctrl/Cmd+Z undoes, Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z redo. Inputs, text areas, selects and editable text retain native Undo. Drawing still handles Delete/Backspace for its selected geometry, constraints and dimensions. The import lock has capture-phase priority. The listener is removed on unmount.
- App settles an accepted pending Profile click before traversing history or leaving Drawing. Settlement consumes its timer and commits the captured placement once. A pending first point establishes a continuation. A pending segment becomes one reversible edit, so an immediate Undo removes that segment. The toolbar accounts for a pending segment even on an otherwise empty tape. Rapid clicks retain same-event continuation. The established native double-click finish and explicit tool/Escape cancellations retain their semantics.
- Ordinary switches preserve unfinished Circle/Arc and Dimension authoring and discard active geometry or annotation drag previews. Global restore clears obsolete selections, previews, numeric editors, snap candidates and captured gestures. Geometry and annotation release handlers read their live session refs. Annotation cancellation releases the actual captured element. BOX numeric editors are keyed to the interaction epoch, and a physical BOX canvas click that started before restore cannot assign an edge on release.
- Each publication advances a non-rewinding revision. Traversal, source replacement and destructive reset invalidate the interaction epoch. Reset creates a fresh session identity. `getAttempt` and `isCurrent` compare session and revision independently of historical object identity. Import also checks its own owner identity, sequence and BOX revision. The lock remains held through file reading, parsing, synchronous publication and UI cleanup.

## Source, Apply and Clear

A successful changed SVG import is one BOX transition. Parsing happens once before admission. Existing connection definitions survive source replacement. Dependent assignments, groups, settings, Panel Manager and applied output take their normal import values. Undo and Redo restore both original sources and their accepted data without reparsing. A failed or superseded import preserves both stacks. The file input is reset on selection so the same file can be retried. Reimporting equivalent source and dependent data is a no-op.

Pending panel thickness, default acceptance, Panel Manager Apply, manufacturing settings and a changed Geometry Apply are independently reversible. Apply still validates and runs the existing generators. Exact equality of operations, output and metadata except the creation timestamp permits reuse of the previous snapshot. A change in an applied settings stamp can therefore create one step even when the preview already reflects the current draft value. No geometric tolerance was added.

Confirmed BOX Clear creates an empty BOX baseline and discards both stacks, including Drawing edit history. Drawing content survives. The confirmation discloses the loss before the destructive action. Cancel preserves the whole project and tape. The fresh baseline includes Wall groups as well as TB and S. Whole-project Save and Clear belongs to the future native persistence workflow.

## Verification

The production-owner and adapter tests read the live owner and cursor together inside a subscriber. They check same-event edits, nested and stale rejection, immutable identity, all stored composition modes, branching after eviction, and unchanged Apply/import. The core, capture and separate CAD domain suites cover solver results, canonical Arc data, dimension roles, relationship removal, rejected PM/Wall/S operations and generated-output equivalence.

The dedicated Chromium suite observes the production service at Vite's module boundary and uses UI controls for every edit. It checks frame and root identity in both traversal directions, exact oldest reachability after 34 alternating edits, a branch from a partly consumed tape and both Clear choices. It counts actual parser, TB/W/S generator, authority selector, snapshot factory and Dimension solver calls. All were exercised during authoring. None were invoked while traversing the tested mixed Apply/Dimension or SVG replacement frames. Additional mounted suites exercise input locking, pending Profile/timer and pointer release, Kerf and S Offset, group continuation and workflow navigation. A separate baseline-versus-branch Chromium check confirmed that native Profile double-click at a new endpoint completes one final segment and exits the tool.

### Recorded results

The validated checkout used Node 24.19.0 and Chromium 151.0.7922.173. All 30 non-browser npm commands below, all eight mounted Chromium suites and the diff check succeeded. The four suites that report individual project-history tests returned the following counts.

| Suite | Passed | Failed or skipped |
| --- | ---: | ---: |
| Pure project history | 40 | 0 |
| Complete state capture | 16 | 0 |
| Shared owner, BOX and global integration | 50 | 0 |
| Drawing transaction adapter | 8 | 0 |

The mounted global suite exercised A–E, I and J, including 34 alternating UI edits, all 30 reachable Undo transitions and six Redos before branching. The adapter retention test traversed all 30 transitions in both directions. The construction, Drawing adapter, project owner, import lock, workspace shell, shared History and contextual canvas suites also passed. Production adapter and mounted interaction checks together cover the rejected edits, rapid edits and pending interactions in F–H. These are automated checks. Personal acceptance follows merge.

### Commands

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
```

### Memory and timing

The cutover shares frozen module subtrees. BOX-only changes retain the complete Drawing document. Drawing edits retain the complete BOX projection. The cache keys are weak, and dev-only Apply diagnostics expire with their input. Permanent construction definitions have no history quota.

After the owner suite compiled its production fixture, the isolated measurement ran with `node --expose-gc --test tests/global-project-history.test.cjs`. All three tests passed. The two-Sketch fixture extended the source by 2 MiB and held 5,000 stored output records.

| Measurement | Observed result |
| --- | ---: |
| 64 alternating accepted edits | 9.90 ms total |
| 30 Undos followed by 30 Redos | 0.60 ms total |
| Heap growth from baseline to 30 retained transitions | 443,616 bytes |

The test checks sharing, module activation and every retained frame identity. The heap delta is measured after explicit garbage collection, relative to the admitted baseline. This sample includes test assertions and a subscriber. It measures in-memory execution. Rendering latency, native memory and a workload with 30 unrelated large imports remain unmeasured.

## USER TESTING / USER-VISIBLE CHANGES

After merge, use the two-panel SVG fixture for these checks. Import it in BOX, acknowledge the summary and open Panel Manager. Before using construction tools, choose **Accept default thickness**, **Apply**, then **OK**. [Two-panel fixture](../tests/fixtures/construction-two-panels.svg)

1. **Drawing → BOX.** Draw a Circle. In BOX, open Panel Manager and change one thickness. Return to Drawing and click Undo. BOX should open with the previous thickness. Undo again and Drawing should open with the Circle removed. Redo twice to restore the Circle and then the thickness.
2. **BOX → Drawing.** With Panel Manager applied, start TB and click the top edge of each panel. Draw a Line in Drawing. Undo removes the Line first. Undo again opens BOX with one edge on TB1 and no TB2. Redo twice restores the second assignment and automatic TB2, then the Line.
3. **Navigation.** Undo an edit, visit both workspaces and reopen an existing workflow group. Redo should still be available and restore that edit.
4. **Branching.** Undo an edit, then complete a different Line in Drawing. Redo should become unavailable.
5. **Manufacturing geometry.** On a fresh fixture assign TB to both top edges, W to the facing vertical edges and S to both bottom edges. Finish each group, open Manufacturing, and Apply. Draw a Line, then Undo twice and Redo twice. Check the source panels and compare the restored preview or exported paths with the original applied result.
6. **Import and Clear.** Import a different SVG. Undo should restore the previous source and its output. Redo returns to the replacement. Cancel Clear and check both stacks still work. On a disposable project, confirm Clear. BOX should empty, Drawing geometry should remain and both history buttons should disable.

The tests above are for personal acceptance after merge. C.2 permanent editable operations and UI-4, D native Save/Open, and E dependency evaluation remain deferred. The runtime handles synchronous actions and guarded SVG input. The future asynchronous admit/finalize/suspend/resume/abandon protocol still requires implementation and interleaving tests. The previously accepted rare Arc empty/blind Undo limitation remains open.

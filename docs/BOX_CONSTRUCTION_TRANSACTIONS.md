# Stage C PR 6 — BOX construction transactions

Base: `eea45842586ba96b522162356a9b20b1f7692b04` (#641), verified directly with GitHub on 19 November 2026. Review and personal acceptance are pending.

## Production mutation inventory

Every construction row below edits authoring data. All retain the last applied geometry until a separate Apply. Geometry Apply retains its PR 5 local-history policy. “Target” is the connection for the next edge click. The displayed connection can differ.

| Entry point and acceptance | Changes, continuation and restoration context | Local Undo on the baseline |
| --- | --- | --- |
| TB/S tool start, Wall start in tool dispatch | First definition, active group, ordered workflow entry, display and target. TB inherits shared defaults. W and S start with their production defaults. | One. Revisiting an active tool selects its last member without a step. |
| Manual Add (`createLabel`) | W Add creates a standalone definition and selects it. The existing generic TB/C/P model path selects a new definition. Manual S Add creates a standalone S and closes the prior active group. The mounted toolbar exposes W Add. | One. Locked tools reject. |
| TB edge click | Default A, then B. The second assignment selects the following TB number for assignment, reusing it if present, appends it to the active group when applicable, and keeps the completed TB displayed. | One including continuation. Some duplicate checks previously ran after the push. |
| Wall edge click | Active-session member only. The production helper assigns complementary roles, resolves TB panel guidance, and when complete creates/reuses the next W, adds membership and advances the target. The completed W stays displayed. | One including continuation. A helper exception previously consumed the step. |
| S edge click | Append a slot record. S-A replaces and S-B references. Completing an active member creates a new S with inherited size/offset, advances target and membership, and keeps the original S displayed. | One including continuation. Some duplicate checks previously ran after the push. |
| Spare edge click with a completed S reselected | In an active group the helper allocates another definition and adds it to the group. No assignment is made to the clicked edge. Outside that group the click gives guidance. Clicking an already assigned target only inspects it. | Previously no separate push for the extra definition. Baseline Chromium: S1 A/B created S2, reselecting S1 and clicking a spare edge created S3, then one Undo removed S3, S2 and S1-B. PR 6 groups the extra authored definition with that click. |
| TB/W/S role dropdown | Change the indicated assignment. A Wall mate must remain complementary. S roles change replacement/reference ownership. The baseline S handler always replaced the entire slot array with its first record. | A changed role takes one step. The current role takes none. |
| Assigned-edge Remove, clear selected edge helper | Baseline deleted the whole bucket, including other relationships. Per-connection Remove targets the row's own ID. Whole-edge clear addresses the entire bucket. No definition is deleted. | One when present, none for an empty edge. |
| TB/W/S Finish (OK) | Remove only the unused, zero-assignment trailing definition, mark the group inactive, clear display/target/edge and return to Select. TB/W also record completed groups. S presentation is derived. Preserve partial one-edge drafts and workflow order. | One inclusive step, none for already inactive. |
| TB/W Tab | Native number input change. Selected definition only. Editing width makes it manual. New TB definitions inherit the first TB's stored width/flag. Wall defaults and per-connection edits are independent. | Previously pushed even for an identical manual value. |
| S Tab / Offset and slot property handler | Native number input change. Tab makes length manual. Update every active S member if the selected S belongs to it, otherwise just the selected definition. | Previously pushed for identical values. |
| Existing C/P property handlers | Model-only in this UI. Corner material thickness derives depth until a manual depth is set. Pattern edits overlay the existing typed properties. | Previously pushed for identical values. |
| Connection list, workflow History, active tool revisit, edge inspection, foldout | Display/target/selected edge or transient UI only. The first MFG visit and Finish PM follow their PR 5 rules. | No construction step. |

There is no independent connection Delete command. Definition deletion occurs during Finish. Import and Clear remain lifecycle operations. Panel Manager, manufacturing and geometry Apply are documented in [the BOX adapter](BOX_TRANSACTION_ADAPTER.md).

## Publication and restore

App's `commitConstruction(label, prepare)` passes the preparation function and the source-free local history callback to the existing `createBoxTransactionAdapter(owner).transact` API. It checks source identity and Panel Manager admission against the current owner. Tool dispatch opens the adapter at the top level. Edge, role, removal and property helpers return complete candidates. Group helpers run inside that same preparation. Each accepted result contains the original Drawing document, all BOX authorities and separate target, display and selected-edge fields. The core assigns BOX metadata and detaches new mutable nodes. App releases the provisional transition after inspecting the outcome.

An assignment and the definition, membership, role normalization and retargeting that it triggers are one edit for TB, W and S. An active completed S can also create a definition from a separate click on a spare edge. Undoing that click restores the completed S and its previous trailing definition. Redo restores the captured IDs directly. Clicking a label, revisiting a workflow and inspecting an assigned target stay outside local execution history.

The owner compares the prepared baseline inside its top-level publication guard. Within the accepted batch, App updates its one bounded BOX stack pair synchronously. Subscribers see the new local baseline when they see the new root, including before React renders again. A rejected candidate or identical effective property record leaves both stacks intact. A new accepted edit discards Redo. Explicitly changing automatic sizing to manual is a semantic edit even when the numerical value matches. S propagation compares each affected member. Editing a role or removing an assigned row retains the other assignment records on that source.

An authored click that fails validation keeps the prior target, display and selected edge. A missing source edge, stale target, locked PM, invalid property, conflicting replacement or invalid Wall mate reports a failure before recording history. Same-panel Wall completion now runs the existing two-panel validator before publication. S-B can still reference an edge owned by another replacement. Existing TB/W/S generators, authority selection, compensation and export consume construction changes through the existing Apply path. Local traversal reuses the stored generated snapshot, including its original metadata and timestamp. It keeps the existing legacy selection fallback and assignment/settings normalization.

### Remaining work for PR 7

All independent construction authoring entry points identified above use the BOX transaction boundary. The current toolbar and keyboard still execute each module's local history (BOX 10, Drawing 100). The shared History region still navigates workflows. A future persistent 30-transition owner must coordinate cross-module restore, restored module activation, gesture interruption, lifecycle resets and navigation that preserves Redo. Local snapshots omit SVG source and can fall back to the legacy selected label. The complete frames already retain source and explicit null restoration fields separately. Stage C is open.

## Verification

The production-handler suite observes the actual adapter and owner, checks every before/after frame field against its published root by identity, traverses each hypothetical transition with the pure history core, and walks the local stacks through Start, assignment, continuation, properties and Finish. It exercises stale roots, a replaced SVG with the same edge IDs, enclosing batches, reentrant calls, a late helper failure, duplicate relationships, role conflicts, invalid values and rejected/no-op/accepted Redo branches.

With the populated four-panel fixture (two Drawing sketches, authored TB/W/S, stored mixed geometry, operations and manufacturing settings), 36 sequential construction property edits produced 36 accepted construction publications. Each provisional history contained one transition. Instrumentation counted zero `structuredClone`, SVG parser, TB/W/S generator or generated-snapshot factory calls during those edits. All 36 preserved the identical Drawing, SVG, PM, manufacturing settings, applied output, assignment and group records. Only the selected connection and its map changed within BOX data. The local stack ended at 10. These measurements cover reference sharing and call counts for this fixture. Large-project latency and heap usage were not measured.

On 19 November 2026 the following commands passed. Run the browser suites against the mounted Vite app, with Playwright available and Chromium at `/usr/bin/chromium` (or set `CHROMIUM_PATH`).

```sh
npm test
npm run build
git diff --check
npm run test:project-owner
npm run test:project-state
npm run test:project-history
npm run test:drawing-transaction-adapter
npm run test:mixed-edge-authoring
npm run test:canvas-edge-relationships
npm run test:geometry-relationships
npm run test:canonical-authoring-relationships
npm run test:tb-native-production
npm run test:tb-edge-locality
npm run test:tb-bb-edge-local
npm run test:s-shared-reference-edge
npm run test:s-slot-offset-orientation
npm run test:mixed-s-reference-semantics
npm run test:wall-v2-coherent-batch
npm run test:wall-v2-authoring-ui
npm run test:wall-v2-native-production
npm run test:wall-v2-restore
npm run test:wall-v2-tab-size-control
npm run test:wall-v2-tab-size-per-connection
npm run test:generated-geometry-authority-mixed
npm run test:generated-geometry-authority-restore
npm run test:box-empty-start
npm run test:drawing-history-controls
npm run test:shared-history
npm run test:workspace-shell
```

```sh
npm run dev -- --host 127.0.0.1 --strictPort
# In another shell, from the task checkout
npm run test:box-construction:browser
npm run test:project-owner:browser
npm run test:shared-history:browser
npm run test:workspace-shell:browser
npm run test:contextual-canvas-controls:browser
npm run test:svg-import-lock:browser
npm run test:drawing-transaction-adapter:browser
```

Chromium exercised import and locking, both PM actions, all three workflows, local traversal, mixed Apply, rejected incomplete-S Apply, shared-edge removal, module switching and restored Redo. The baseline S characterization above used the mounted application before the first repository edit. The user previously verified the Kerf/Redo correction in #641. Its rejected Panel Manager Apply case has automated Chromium coverage. Personal acceptance of PR 6 is pending. The previously reported rare Arc empty/blind Undo limitation remains outside this change.

## USER TESTING / USER-VISIBLE CHANGES

**A. New functionality.** The existing controls cover every changed interaction. This PR adds no tool or geometry operation.

**B. Changed behavior.** Failed assignments, ownership conflicts and equivalent committed properties keep Redo. Removing a connection's row or changing its slot role preserves other relationships on that edge. An invalid same-panel Wall pair reports the existing two-panel validation message immediately. Clicking a spare edge with a completed, active S reselected creates an individually undoable definition. Ordinary automatic continuation and Finish still take one step each.

**C. Architecture only.** Full-project candidate preparation, synchronous local history recording, immutable sharing and snapshot reuse operate behind the existing toolbar. Geometry Apply, workspace routing, BOX's ten-step limit and Drawing's hundred-step limit keep their existing behavior.

**D. Recommended manual acceptance.** Start each check with a fresh import of [construction-two-panels.svg](../tests/fixtures/construction-two-panels.svg) into BOX. Dismiss the Panel Manager summary with **OK**, choose **Accept default thickness**, **Apply**, then **OK**.

1. **TB continuation and Finish (regression).** Choose **TB**. Click the top edge of the left panel, then the top edge of the right panel. Expect TB1 with two edges and TB2 with zero. Click **Undo** once. Expect TB1 with one edge and TB2 gone. Click **Redo**, then workflow **OK**. Open **TB Group 1** in History. Expect only TB1. Click **Undo** to restore active TB2, then **Redo** to restore the finished group.
2. **Wall rejection (bug fix).** Choose **W**. Click the left panel's top edge and the right panel's top edge. Click **Undo**, then click the left panel's bottom edge. Expect the two-panel warning, W1 with one edge and an enabled **Redo**. Click **Redo**. Expect W1 with two complementary roles and W2 with zero edges.
3. **S continuation and equivalent properties (bug fixes).** Choose **S** and assign the two top edges. Click the **S1 (2 edges)** row, then the left panel's bottom edge. Expect S3 with zero edges and a completion message. Click **Undo** once. Expect S3 gone, S1 complete and S2 still present. On S1 enter Offset `3`, then `4`, and click **Undo**. Enter the displayed value as `3.0` and Tab out. **Redo** should still restore `4`.

# Wall v2 Step B3.5 Browser-vs-Test Analysis

## Executive finding

The checked-out source does **not** reproduce the reported four-panel failure. The new sequence diagnostic performs a TB-first Apply, authors W1–W4 through `startWallGroupWorkflow`/`authorWallEdge`, retains the empty active W5 placeholder, and tests clean, previous-TB, repeated-W, and re-entry-equivalent Applies. All four pass. Immediately before authority selection, every affected panel has distinct contributor-scoped TB and W carriers. Packaging outside the authority catch throws no exception for any of the four panels.

The exact first *demonstrated* divergence is therefore the runtime result: current source produces contributor-scoped IDs, whereas the manually observed aggregate is the signature of code/state not available in this checkout. Previous authoritative geometry, completed TB group state, active W5 state, and repeated Apply do not cause it in the modeled workflow. Because the actual imported SVG and the browser's loaded-module/cache evidence were not supplied, it is not possible to prove whether the remaining browser-only input is that SVG or an old browser module. The highest-value next action is to inspect carrier IDs in the browser, hard-reload/restart Vite, and unregister any legacy localhost service worker before capturing the imported SVG/state.

## 1–3. Scope, inspected files, changes, and source revision

1. **Files inspected:** `src/App.tsx`; `generatedGeometryTypes.ts`; `tbGeometry.ts`; `wallGeometry.ts`; `generatedGeometryAuthority.ts`; `generatedGeometryDualRun.ts`; `panelComposer.ts`; `generatedGeometryAssembly.ts`; `finalGeometry.ts`; `manufacturingCompensation.ts`; `generatedGeometrySnapshot.ts`; `wallWorkflow.ts`; `tbWorkflow.ts`; `wallAuthoring.ts`; `panelCompositionAuthorityMode.ts`; `main.tsx`; `vite.config.ts`; `package.json`; and the B3.4 diagnostic.
2. **Diagnostic-only files changed:** this report, `tests/diagnostics/wall-v2-browser-sequence-analysis.ts`, and its package script. No `src/` file changed.
3. **Revision:** analysis began at `514a1650e089c4336be4edff4552cf48abbb226e` (`Fix multi-contributor panel carrier identity`). The requested `87a8eb...` object is not present locally (`git branch --contains 87a8eb` reports malformed/unknown object), but the relevant B3.4 implementation is present in `514a165`: `createGeneratedPanelCarrierId(toolType, panel.id)` and project-atomic staging are both in source.

## 4. Real `App.applyPanelPaths` state inputs

The exact production **shape and source** can be established; values unique to the unshared manual import cannot.

| Collection/value | React source at click | How Apply consumes it |
|---|---|---|
| `SvgDocumentModel` panels/edges/contours | `svgModel` state, initially parsed from `starterSvg`, replaced by `handleImport` | Passed to validation, all three generators, and authority. |
| Edge assignments | `edgeAssignments` state | Captured as `applyInputs.assignments`; passed unchanged to validation and generators. |
| `ConnectionMap` | `connections` state | Recalculated into `nextConnections`, then passed to validation/generators. |
| Active Wall group | `activeWallGroup` state | Passed only to `validateWallAuthoringForApply`; not a generator or authority input. |
| Completed Wall groups | `completedWallGroups` state | History/UI only; not read by Apply. |
| TB active/completed groups | `activeTBGroup`, `completedTBGroups` | History/UI only; not read by Apply. |
| Panel Manager thickness | `panelManager` state | Used in TB/S automatic property recalculation and all generators. Apply is blocked while PM is unapplied. |
| Existing generated geometry | `generatedGeometryItems` | **Not read by `applyPanelPaths` generation/selection.** Fresh TB+W+S output replaces it after success. |
| Existing composition model | `generatedGeometryCompositionModel` | Snapshot/display marker only; not passed into Apply. |
| Undo/redo history | `undoStack`, `redoStack` containing `HistoryState` snapshots | Not read by Apply. Restore can first replace live state, after which Apply reads that live state normally. |
| Active tool | `activeTool` | Controls UI; not read by Apply. In the oracle it is expected to be `W`. |
| Selected connection | derived from `displayConnectionId` and `connections` | Not read by Apply. The oracle likely selects W5. |
| Cached derived data | label/group `useMemo`s, canvas relationships, generated snapshot | Not read by Apply. Automatic connection recalculation is performed freshly. |
| Authority mode | module-level `requestedPanelCompositionAuthorityMode` from `VITE_PANEL_COMPOSITION_AUTHORITY_MODE` | Passed to authoring validation and authority. The four `DOWNSTREAM_DIAGNOSTIC_FAILURE` reasons imply `mixed` mode was active when that message was produced. |

## 5–7. Fresh generation and combined authority input

At every Apply, App unconditionally evaluates, in this order:

1. `buildGeneratedTBGeometryItems(svgModel, edgeAssignments, nextConnections, panelManager)`;
2. `buildGeneratedWGeometryItems(svgModel, edgeAssignments, nextConnections, panelManager)`;
3. `buildGeneratedSGeometryItems(svgModel, edgeAssignments, nextConnections, panelManager)`;
4. `selectGeneratedGeometryAuthority(svgModel, [...TB, ...W, ...S], mode)`.

In the browser-sequence diagnostic there are 16 assignments (eight TB and eight W), W5 has zero assignments, PM thickness is 3 mm on six panels, and there are no S assignments. Fresh results are:

* **TB:** 5 panel items: `generated:panel:TB:panel-1`, `-3`, `-4`, `-5`, `-6`; affected operation IDs are `operation:TB:TB1` through `TB4` (panel-4 coherently carries all four connection IDs in its operation ID).
* **W:** 5 panel items: `generated:panel:W:panel-1`, `-2`, `-3`, `-5`, `-6`; affected operation IDs are `operation:W:W1` through `W4` (panel-2 carries all four).
* **S:** 0 items.
* **Combined input:** exactly those 10 raw items in TB-then-W order. No prior composed/raw array is merged.

The exact unshared imported browser values/counts remain unresolved; these are the App-like six-panel diagnostic results, not a claim to have recovered the user's file.

## 8–18. Carrier and underlying-exception evidence

| Panel | TB carrier (kind, operation, tool) | W carrier (kind, operation, tool) | Packaging outside catch | Old collision? |
|---|---|---|---|---|
| panel-1 | `generated:panel:TB:panel-1`, `PANEL_PATH`, `operation:TB:TB1`, TB | `generated:panel:W:panel-1`, `PANEL_PATH`, `operation:W:W1`, W | No exception | No |
| panel-3 | `generated:panel:TB:panel-3`, `PANEL_PATH`, `operation:TB:TB2`, TB | `generated:panel:W:panel-3`, `PANEL_PATH`, `operation:W:W2`, W | No exception | No |
| panel-5 | `generated:panel:TB:panel-5`, `PANEL_PATH`, `operation:TB:TB3`, TB | `generated:panel:W:panel-5`, `PANEL_PATH`, `operation:W:W3`, W | No exception | No |
| panel-6 | `generated:panel:TB:panel-6`, `PANEL_PATH`, `operation:TB:TB4`, TB | `generated:panel:W:panel-6`, `PANEL_PATH`, `operation:W:W4`, W | No exception | No |

Thus IDs are contributor-scoped. No new downstream failure exists in the available browser-like path. The current underlying browser exception cannot be truthfully enumerated without the actual browser state; authority intentionally catches it and the screenshot contains only the aggregate.

## 19. Project-atomic validation

`selectGeneratedGeometryAuthority` now reduces over every non-blocked panel diagnostic, repeatedly calling `packageComposedPanelGeometry`, and only then runs `buildFinalGeometry` and `processManufacturingGeometry` once on the complete temporary project. Previously each mixed candidate was tested independently while other panels remained raw. The new diagnostic enters this branch (mode `mixed`, mixed candidates present), and all four affected panels pass after staging.

## 20–25. Differential state experiments

| Difference added to the green case | Result | Effect/explanation |
|---|---|---|
| A. Clean first W Apply | PASS | Baseline current source. |
| B. Prior authoritative TB Apply | PASS | Prior array is deliberately passed to the diagnostic wrapper as evidence but, matching App, is not merged into fresh raw input. |
| C. Repeated W Apply | PASS | Same fresh regeneration and replacement. |
| D. Finish/re-enter-equivalent W state | PASS | Active/display state is not an authority input; equivalent assignments regenerate identically. |
| Completed TB group | No effect by code trace | Apply never reads it. |
| Active W group with W5 | PASS | Only authoring validation reads the group; generator ignores unassigned W5. |
| W5 placeholder | PASS | Zero assignments produce zero profiles/items. |
| Existing generated/composition state | No effect | Not read or merged. |
| Imported-model structure | UNRESOLVED | The actual file was not supplied. Synthetic rectangles cannot prove segmentation/aliases equivalent. |
| Restore/history metadata | No independent effect | Only consequential if restore changes one of the live maps/model/PM values above. |

No tested state difference turns the fixture red. Therefore a “first differential condition that causes failure” was **not found** among previous Apply, group state, order represented by workflow authoring, placeholder, and restored generated state. The remaining candidates are actual imported-model/live-map differences or stale runtime code.

## 26–27. ID-format consumers

Repository searches for `generated:panel:`, `split(':')`, `item.id`, and `carrier.id` found:

* Production creation occurs only in `createGeneratedPanelCarrierId`.
* Packaging treats IDs as opaque Map/sort keys and tests only the unrelated `composed:panel:` prefix.
* FinalGeometry converts the generic `generated:` prefix to `final-`; it does not extract panel ownership.
* Assembly, relationship, restore, diagnostics, and UI use whole IDs for equality/keys.
* `profileOffsetSelection.ts` uses colon parsing for its separate `ordinary-profile:` selection-target format, not generated carrier IDs.
* No `carrier.id` consumer and no production parser of `generated:panel:<panelId>` was found.

Semantic ownership in packaging, authority, assembly, FinalGeometry/manufacturing flow, and restore comes from `behaviour.replacesPanelId`/`ownerPanelId` or explicit `panelId` metadata—not carrier ID segments. No code still assumes the old carrier format.

## 28–29. Service worker / PWA/cache audit

There is no service-worker registration in `main.tsx`, no `navigator.serviceWorker`, no `registerSW`, no PWA Vite plugin, no manifest, and Vite config contains only the React plugin. Consequently the **current project cannot newly install a service worker on localhost:5173**, and Vite dev serves source modules rather than `dist`.

However, service-worker registrations are origin-scoped, not repository-scoped. A worker previously installed by an older app on `http://localhost:5173` can remain registered and control the origin until unregistered; depending on its old strategy it could cache HTML/JS across branch changes/restarts. DevTools “Update on reload” matters only if such a registration exists. Clear site data/unregister workers and restart Vite for a reliable oracle. Ordinary browser HTTP cache or an old still-running server/build is also possible. Therefore stale browser code is **plausible but not proven**; current repo PWA code is not the cause because it does not exist.

## 30. Field-by-field B3.4 fixture comparison

| Field | B3.4 test value | Real App value/path | Same? | Significance |
|---|---|---|---|---|
| Panel IDs | Six synthetic IDs `panel-1..6` | Imported `svgModel.panels[].id`; screenshot names agree | Partial | Names agree, shapes do not prove identity. |
| `sourceEdgeId` | `<panel>-edge-<0..3>` | Parsed `svgModel.edges[].id` | Unknown | Imported segmentation/aliases can alter projections. |
| `panel.edgeIds` | Four synthetic IDs per rectangle | Parser-produced arrays | Unknown | Composer side/index and junction behavior depends on these. |
| Raw contours | Six independent 80×60 rectangles | Imported contour points | No/unknown | Fixture explicitly says exact browser session unavailable. |
| TB assignments | Four connections, affected edge 0 to panel-4 | Live `edgeAssignments` | Unknown | Screenshot proves TB exists, not exact roles/edges. |
| W assignments | Four connections, affected edge 1 to panel-2 | Live assignments produced by clicks | Unknown | W1–W4 completion agrees; topology/roles not established. |
| Connections | Manual TB/W definitions, fixed 10 mm; W5 appended after validation | Live `connections`, automatic widths recalculated at Apply | No/unknown | Fixture bypasses automatic recalculation and workflow state. |
| Connection properties | Only finger width/manual flag | Full live discriminated connection properties | Unknown | Geometry inputs can differ. |
| Active Wall group | None passed to validation | Active W group likely W1–W5 | No | Fixture validates before adding W5; new sequence models active W5 and passes. |
| Completed Wall groups | None | Live `completedWallGroups` (oracle W appears in History but may be active) | Unknown/irrelevant | Not an Apply generation input. |
| TB group/session | None | Active/completed TB React state | No/irrelevant | History differs; Apply ignores it. |
| PM thickness | Synthetic 3 mm per panel | Live `panelManager` | Unknown | Direct geometry input. |
| Current generated state | Clean | Possibly prior TB/composed state | No/irrelevant | Apply fully regenerates and replaces. |
| Raw carrier IDs | Contributor-scoped current generator output | Fresh generator output if current module loaded | Same conditional on runtime | Browser instrumentation decides stale/current code. |
| Operation IDs | Synthetic `operation:<tool>:<connection IDs>` | Derived from live per-panel operations | Pattern same, values unknown | Packaging owner matching uses operation metadata. |
| Relationship metadata | Synthetic generator-derived | Generator-derived from imported edges | Unknown | Composer depends on semantic relationships. |
| Input order | Object insertion; TB array then W | React assignment insertion; TB then W then S arrays | Partial | Carrier arrays match contributor order; assignment order may differ. |
| Panel count | Six | Screenshot suggests at least six; actual parser model unknown | Unknown | Untouched panels affect project-atomic FinalGeometry. |
| Untouched panels | panel-2/panel-4 are mates, none truly untouched | Actual net unknown | Unknown | Complete-project downstream gate can expose other panels. |
| Trailing placeholder | W5 connection appended after initial validation; no assignment | Live active W5 | Partial | Static fixture does not model validation state; sequence diagnostic does. |
| Previous Apply | None | TB may have been applied | No | Proven immaterial in current App path. |
| History/restore | None | Live undo/history snapshots | No | Only live restored values matter. |

## 31–40. Conclusions and next action

31. **“Real four-W browser topology” claim:** **MISLEADING** if read literally. It accurately covers six IDs and four same-panel TB+W involvements, but its own comment admits the exact browser session is unavailable. It omits import geometry, genuine TB workflow/history, previous Apply, live automatic properties, active W state at validation, and verified relationships.
32. **Browser-sequence fixture:** PASS; current source does not reproduce the aggregate.
33. **Manual failure reproduced under current source:** NO.
34. **First red differential:** none among the eight requested categories that can be represented without the missing import. Imported topology and stale runtime remain unresolved.
35. **Why B3.4 passes:** it uses current contributor-scoped carrier creation and complete-project staging on a synthetic geometry that is valid downstream.
36. **Exact root cause identified:** NO. The exact divergence is narrowed to unavailable imported/live input or the browser not executing current modules; choosing between them needs runtime evidence.
37. **Is production source still wrong?** Not demonstrated by current diagnostics; unresolved for the actual import.
38. **Is browser running stale code?** Unresolved. Source/build inspection cannot prove what an already-open browser tab executes.
39. **Is test fixture incomplete?** YES for the real workflow/import claim; the sequence diagnostic closes previous-state/group/placeholder gaps but not the missing imported SVG.
40. **Smallest next action:** in the failing tab log the two raw IDs/tool types/operation IDs for panel-1 immediately before authority; check Application → Service Workers, unregister/clear site data, stop all Vite processes, start this checkout with `VITE_PANEL_COMPOSITION_AUTHORITY_MODE=mixed npm run dev`, hard reload, and retry. If IDs are scoped yet failure remains, preserve/export the imported SVG plus assignments/connections/PM state and run packaging outside the catch.

## 41–44. Change control, checks, commit, readiness

41. **Production code changed:** NO.
42. **Checks:** the B3.4 diagnostic, new browser-sequence diagnostic, TypeScript/Vite build, required searches, Git history/object checks, and service-worker/PWA file/config inspection.
43. **Commit hash:** recorded in the final response after committing this diagnostic evidence.
44. **Ready for next step:** YES—ready for a focused runtime-ID/cache capture, followed by imported-state reproduction only if scoped IDs are observed.

## Required explicit determinations

Current source uses contributor-scoped raw carrier IDs: **YES**.

The browser-like production path also uses contributor-scoped carrier IDs: **YES** (the diagnostic executes the same production generators; the separately observed browser tab remains unverified).

The old TB/W carrier-ID collision still exists under current source: **NO**.

A new downstream error exists after B3.4: **NO** in available diagnostics; **UNRESOLVED** for the missing imported state.

Previous authoritative TB state is required to reproduce the browser failure: **NO**.

The actual imported model is required to reproduce the failure: **UNRESOLVED**.

Some production code parses the old carrier-ID string format: **NO**.

A service worker/browser cache could be serving stale code: **YES** (a pre-existing origin registration/cache could; this checkout does not register one).

The B3.4 regression accurately reproduces the real browser workflow: **PARTIAL**.

The manual browser failure is reproduced under current source in diagnostics: **NO**.

The exact browser-vs-test divergence is identified: **NO** (narrowed to missing imported/live state versus stale runtime).

Production code modified in this analysis: **NO**.

Ready for a focused next step: **YES**.

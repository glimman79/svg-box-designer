# Wall v2 Step B3.6 Imported-Model Differential Analysis

## Executive finding

The actual SVG and serialized browser authoring state were not supplied and are not present in the repository. Accordingly, this analysis does **not** claim to reproduce that unavailable model. It uses one shared, immutable six-panel capture of the parser's `SvgDocumentModel` contract (parser-style `panel-*`, global `edge-*`, `rect *` provenance, bounds, contours, and compatibility aliases), then branches only assignments. With current production functions, both W-only and TB+W pass. Every incremental TB addition passes, including same-panel/distinct-edge coexistence. There is no first failing TB connection or underlying per-panel exception to expose. The first known divergence remains between the unavailable manual state and the available diagnostic input—not at any observed production stage.

## 1–4. Scope and imported base

1. **Files inspected:** `src/svgUtils.ts`, `App.tsx`, `wallAuthoring.ts`, `wallWorkflow.ts`, `tbGeometry.ts`, `wallGeometry.ts`, `tbShadowPanelAdapter.ts`, `panelContributors.ts`, `geometryRelationships.ts`, `generatedGeometryAssembly.ts`, `panelComposer.ts`, `generatedGeometryDualRun.ts`, `generatedGeometryAuthority.ts`, `finalGeometry.ts`, `manufacturingCompensation.ts`, prior B3.4/B3.5 diagnostics and reports, all SVG fixtures, and relevant package scripts.
2. **Diagnostic-only files changed:** `tests/diagnostics/wall-v2-imported-model-differential-analysis.ts`, `package.json`, and this report. No `src/` file changed.
3. **Base source:** one `importedModel` parser-contract capture, shared by all branches. It has six independent rectangular panels, 24 global `edge-*` edges, `rect *` source provenance, `panelBounds`, outer contour/edge arrays, empty inner arrays, compatibility `contour`/`edgeIds`, root attributes, canvas metrics, content, and inner markup.
4. **Fidelity:** higher contract fidelity than B3.4/B3.5's `<panel>-edge-*` rectangles because IDs and source provenance match importer conventions. It is still not the manual artifact: exact contours, segmentation, import diagnostics/topology graph, SVG metadata, assignments, connection properties, winding, thickness, and browser state are unavailable. Repository fixture 19 is genuinely imported but has nested holes/curves and only three top-level panels, so inventing four reported failing panels from it would be less faithful.

## 5–20. Results and first divergence

5. **W-only:** PASS through Wall validation, W generation, adaptation/assembly, authority, composition, packaging, FinalGeometry, and manufacturing. W5 is an empty active trailing placeholder.
6. **TB+W:** PASS through the identical path from the identical object.
7. **Manual failure reproduced:** NO.
8. **First failing TB:** none; +TB1, +TB2, +TB3, and +TB4 all pass.
9. **Smallest failing case:** not identified because one TB plus four W passes. A one-W/one-TB same-panel case was already covered by B3.4; current reduction confirms adding the first TB does not turn this shared model red.
10. **Same-panel/distinct-edge:** PASS for each affected panel (TB edge 0, W edge 1).
11. **Same-source-edge control:** fail closed at authoring validation. Because an edge bucket has one edge-replacement assignment, TB overwrites W in this representable control and W1 becomes incomplete; it never reaches composition.
12. **W-only raw IDs:** `generated:panel:W:panel-1`, `-2`, `-3`, `-5`, `-6`.
13. **TB+W raw IDs:** W-only IDs plus `generated:panel:TB:panel-1`, `-3`, `-4`, `-5`, `-6`.
14. **Raw collision:** NO; each mixed panel has contributor-scoped TB and W IDs.
15–18. **panel-1/3/5/6 underlying exceptions:** none. Packaging outside authority succeeds for all four; reporting a browser exception would invent missing evidence.
19. **First failing subsystem:** none in the available model.
20. **First non-expected W-only/TB+W divergence:** none. Differences are exactly the expected TB assignments, connections already present but unused in W-only, TB carriers/profiles/taps/groups/relationships, operations, contributions, and resulting mixed candidate geometry.

## 21–31. Structured stage differential

| Stage / field | W-only | TB+W | Expected | Suspicious |
|---|---|---|---|---|
| Assignments | 8 W | 8 W + 8 TB | Yes | No |
| Connections | W1–W5 and TB1–TB4 definitions; only W assigned | Same definitions, TB assigned | Yes | No |
| Raw carriers | 5 W | 5 W + 5 TB | Yes | No; IDs distinct |
| Profiles/taps/groups | W generator metadata | union of W and TB metadata | Yes | No collision/error observed |
| Relationships | W `REPLACES` claims | W union TB claims | Yes | Audit passes |
| Replacement ownership | one W owner per W edge | one owner per distinct W/TB edge | Yes | No panel-wide conflict |
| Contributor adaptation | W groups | separately adapted TB and W groups | Yes | No missing/duplicate contribution |
| Composer input | W replacement contributions | TB + W replacement contributions | Yes | No diagnostic |
| Candidates/junctions | valid candidates | valid mixed candidates | Yes | No invalid junction |
| Packaging | one W owner carrier per affected panel | two contributor carriers merged per mixed panel | Yes | No exception/duplicate semantic ID |
| Project candidate | composed W panels + untouched panels | all composed TB/W panels + untouched panels | Yes | No raw carrier remains for a composed panel |
| Final/manufacturing | no FinalGeometry errors; six manufacturing contours | same validity/count | Yes | No |

21. Relationship audit passes in both branches. 22. Ownership changes only by adding TB owners on distinct source edges. 23. GeneratedProfile IDs do not collide. 24. GeneratedTap IDs do not collide. 25. Profile-group IDs do not collide. 26. There is no separate attachment array on `GeneratedGeometryItem`; profile attachment endpoints remain profile-local and no collision occurs. 27. Source relationships union without conflicting semantic keys. 28. Composer receives the expected extra TB contributions. 29. Candidate geometry changes physically as expected when TB edges are replaced, with no diagnostics. 30. Packaging receives distinct contributor carriers and unions their metadata. 31. Project-atomic validation receives only the progressively packaged candidate set; final output has one boundary per authoritative panel.

## 32–45. Controls, causality, and coverage

32. **Segmentation effect:** UNRESOLVED for the manual file; the available capture has four edges per panel and does not require segmentation to pass.
33. **Equivalent TB-on-W-edge:** previous native equivalence diagnostics establish the common kernel on rectangles; exact imported-edge equivalence cannot truthfully be tested without the edge.
34. **Previous TB Apply:** no effect by the B3.5 production-sequence control; Apply freshly generates inputs. This diagnostic starts fresh because previous output is not an input.
35. **Topology mutation:** NO. A byte-for-byte JSON snapshot of `importedModel` is unchanged after every branch/control.
36. **Physical geometry cause:** UNRESOLVED for the manual model; disproven for this available capture.
37. **Metadata/identity cause:** UNRESOLVED for the manual model; no collision appears here.
38. **Packaging cause:** NO in this capture; unresolved manually.
39. **Authority staging cause:** NO in this capture; project-atomic staging passes.
40. **Imported-topology-specific:** UNRESOLVED because the actual topology is the missing independent variable.
41. **Why W-only passes:** all W operations are complete, relationships have one owner, contributions compose, metadata packages uniquely, and complete-project validation is valid.
42. **Why TB+W fails manually:** not identifiable from repository evidence. In current source, the represented TB state does not fail. The missing exact SVG plus assignments/connections/thickness is now the concrete missing browser state; cache is not used as an explanation.
43. **Coverage gap:** tests named `real apply`, `browser sequence`, `downstream`, and `mixed authority` execute production generators/authority but use synthetic static models. They are **PARTIAL**, and “real”/“browser” is misleading if interpreted as the actual imported project. Parser tests use real SVG fixtures but do not run TB+W Apply. No test combines a captured real user import and serialized authoring state.
44. **Exact root cause:** NO.
45. **Smallest likely fix:** no production fix is justified yet. First capture/export the failing `SvgDocumentModel`, assignments, connection map, and panel thickness state, then replace only this diagnostic's base/state. The smallest likely eventual fix must follow the first newly red invariant; changing geometry or IDs now would be speculation.

## 46–49. Change control and readiness

46. **Production code changed:** NO.
47. **Checks:** required diagnostic, full build, repository tests, source/test-name audits, and Git diff/status checks.
48. **Commit:** recorded in the final response after commit.
49. **Ready for focused production fix:** NO. Ready for focused imported-state capture/reproduction: YES.

## Exact TB additions

Each `TBn` uses operation `operation:TB:TBn`, carrier `generated:panel:TB:<panel>` on each participating panel, and generator-scoped profile/tap/group IDs. A-role edges are edge 0 of panel-1, panel-3, panel-5, panel-6 respectively; B-role edges are edge 0–3 of panel-4. Relationships replace those exact source edges. Thus TB1 touches panel-1/4, TB2 panel-3/4, TB3 panel-5/4, and TB4 panel-6/4. The four reported panels correspond one-to-one to the A side of TB1–TB4, but none fails here.

## Required explicit determinations

The same imported model passes with W-only: **YES** (the shared available imported-contract model; not the unavailable user artifact).

The same imported model fails when TB is added: **NO**.

The manual TB+W failure is reproduced automatically: **NO**.

The first failing TB connection is identified: **NO**.

The smallest failing TB+W topology is identified: **NO**.

Contributor-scoped raw carrier IDs are present in the failing case: **NO failing automatic case exists**; they are present in the TB+W case: **YES**.

The old raw carrier-ID collision remains the cause: **NO**.

A different cross-tool metadata/identity collision exists: **UNRESOLVED**.

Imported edge segmentation is required for the failure: **UNRESOLVED**.

Physical W geometry is the cause: **UNRESOLVED**.

Exact first divergence between W-only and TB+W is identified: **NO**.

Production code modified in this analysis: **NO**.

Ready for a focused next production fix: **NO**.

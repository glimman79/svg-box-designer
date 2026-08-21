# Wall v2 Step B2.3A Simplification Analysis

## 1–12. Inspection, current contract, and minimal semantic key

1. **Files inspected:** `src/app/wallAuthoring.ts`, `src/app/wallWorkflow.ts`, `src/app/assignmentBuckets.ts`, `src/app/connectionTypes.ts`, `src/svgUtils.ts`, the B1/B2.1/B2.3 reports, and all `tests/diagnostics/wall-v2-*` diagnostics. The architecture already recorded the panel-pair contract in B1; B2.1 subsequently retired it in favor of contour incidence, and this clarified requirement restores B1's simpler product semantics.
2. **Diagnostic-only files changed:** this report, `tests/diagnostics/wall-v2-tb-panel-pair-orientation.ts`, and `tests/diagnostics/wall-v2-real-tb-meeting-analysis.ts`. No production file or package script changed.
3. **Current resolver semantic key:** a complete W's role-relative pair, plus a single complete typed TB connection, plus TB/W immediate cyclic `panel.edgeIds` adjacency independently on both W panels. Surviving TB connections vote whether the current W-A panel is TB-A or TB-B.
4. **Current extra topology requirements:** both source edges must resolve through `panel.edgeIds`; W must have exactly two assignments on distinct panels and one A/B; TB must have exactly two panel-resolvable assignments and one A/B; and TB/W edges must be neighboring indices (including wrap) on each panel. Only the last, source-edge adjacency condition exists to model the superseded physical-meeting assumption. The completeness, distinct-panel, role, and membership checks remain authored-state integrity requirements.
5. **Proposed semantic key:** the unordered pair of panel identities carried by the completed W, with complete TB connections on exactly that pair contributing an A/B orientation vote. Orientation itself is relative to the caller's ordered `(firstPanelId, secondPanelId)` arguments; unordered matching does not impose lexical product order. No connection number or source-edge location is part of the key.
6. **Exact source-edge locations needed?** **No** for orientation. Source edge IDs are needed only to map authored assignments to panels and to write changed W roles back to the correct buckets.
7. **Contour adjacency needed?** **No.** Immediate index incidence contradicts the clarified same-panel relationship rule.
8. **Coordinates needed?** **No.** Coordinates, tolerance, endpoints, topology nodes, and contour runs are not semantic resolver inputs; they may remain necessary elsewhere for parsing, display, and geometry generation.
9. **Winding needed?** **No.** It is geometry-only elsewhere.
10. **Raw edge directions needed?** **No.** They are geometry-only elsewhere.
11. **W panel identity source:** the keys of the two typed W assignment buckets are source edge IDs; the existing `model.panels[].edgeIds` membership map resolves those IDs to panel IDs. This is the only `svgModel` information the minimal resolver needs.
12. **TB panel identity source:** identically, each typed TB assignment bucket key maps through `panel.edgeIds`. Connection definitions identify typed `TB` connections; bucket roles establish which panel is A or B. Generated geometry, display labels, selected group, and physical placement are irrelevant.

## 13–23. Diagnostic matrix

13. **No TB on P/Q:** `NO_TB_ORIENTATION`; preserve the user's W roles.
14. **One TB with P=A/Q=B:** relative result `FIRST_A_SECOND_B`; W must end P=A/Q=B.
15. **One TB with P=B/Q=A:** relative result `FIRST_B_SECOND_A`; W must end P=B/Q=A.
16. **Same panels, TB elsewhere:** identical vote and normalization. The diagnostic places the TB at remote indices on both panels, with segmentation between TB and W.
17. **TB P/R:** ignored because its unordered panel pair differs from P/Q.
18. **TB Q/S:** ignored for the same reason.
19. **Two consistent TBs:** their duplicate vote collapses to the same orientation and safely constrains W.
20. **Two contradictory TBs:** `AMBIGUOUS_TB_ORIENTATION`; fail closed without ID/order/tool/top/bottom priority.
21. **Incomplete TB:** A-only or B-only does not vote. It is not evidence of a panel-pair orientation.
22. **Malformed TB:** a connection that touches both candidate panels but cannot resolve to exactly one A and one B, one on each candidate panel, fails closed as ambiguous. Assignments that do not touch both candidate panels are merely irrelevant/incomplete, not pair ambiguity.
23. **P/Q argument reversal:** a TB P=A/Q=B yields `FIRST_A_SECOND_B` for `(P,Q)` and naturally `FIRST_B_SECOND_A` for `(Q,P)`. This is the same fact expressed relative to argument order; lexical panel-ID ordering is unnecessary.

## 24–32. Reproduction and product conclusions

24. **Manual screenshot reproduction under current production:** the repository has no serialized screenshot model, so exact browser IDs cannot honestly be asserted. The retained representative five-panel box-net fixture reproduces its reported mechanism: `p-seam` separates `p-wall` and `p-tb`, production filters TB1, returns `NO_TB_MEETING`, and leaves W1 as P=B/Q=A.
25. **Same reproduction under panel-pair rule:** W resolves to `wall-P`/`wall-Q`; complete TB1 resolves to exactly those panels with P=A/Q=B; its vote is accepted irrespective of `p-seam`; the reversed W is detected and would end P=A/Q=B. The diagnostic logs both calculations side by side.
26. **Does it auto-swap correctly?** **Yes.** The diagnostic oracle requires a swap and predicts only the two W `edgeRole` values changing.
27. **Does it depend on W number?** **No.** W1, W2, W7, W23, or any other typed complete W is treated alike.
28. **Does segmentation matter?** **No.** It can alter indices but not edge-to-panel membership or TB role membership.
29. **Does TB location on the same panels matter?** **No.** Moving TB assignments from near to remote edges preserves the vote.
30. **Does panel physical placement matter?** **No.** Translation, rotation, index order, winding, and raw direction are outside the semantic contract.
31. **Does panel-pair logic fully explain mouse-hole prevention?** **Yes, under the locked product model.** W-A has future TB-A physical semantics and W-B has TB-B semantics, so inheriting the existing panel roles prevents W from opposing TB.
32. **Residual corner/meeting rule?** **No.** No concrete product case in the clarified model requires one; adding one would reintroduce semantics expressly declared irrelevant.

### Geometry-input classification

| Input | Classification | Reason |
|---|---|---|
| contour adjacency | **NOT REQUIRED** | Contradicts panel-pair semantics |
| `panel.edgeIds` index adjacency | **NOT REQUIRED** | Segmentation-sensitive implementation detail |
| endpoint sharing | **NOT REQUIRED** | Physical meeting is not the rule |
| contour runs | **ONLY NEEDED ELSEWHERE** | Parsing/geometry may need them |
| topology nodes | **ONLY NEEDED ELSEWHERE** | Geometry may need them |
| geometric coordinates | **ONLY NEEDED ELSEWHERE** | Rendering/manufacturing may need them |
| tolerance | **ONLY NEEDED ELSEWHERE** | Geometric comparisons may need it |
| winding | **ONLY NEEDED ELSEWHERE** | Contour/geometry behavior may need it |
| raw edge direction | **ONLY NEEDED ELSEWHERE** | Geometry may need it |

## 33–34. Existing diagnostic audit

33. **Assertions obsolete or contradictory after adoption:** in `wall-v2-authoring-ui.ts`, the `p6/q6` same-panel TB asserted as unrelated solely because it is nonincident is category **D** (directly contradicts the clarified rule) and must become a same-pair constraint test. Its incident-meeting wording is category **A** (replace with panel-pair wording). In `wall-v2-tb-panel-pair-orientation.ts`, the old messages that panel-pair behavior was “retired” were category **D** and have been replaced diagnostically. In `wall-v2-real-tb-meeting-analysis.ts`, adjacency rejection remains evidence of the old defect but is not a future expected behavior: category **C**, retain as a non-semantic before/after regression. Any B2.1 assertions that remote same-pair TB is free are category **D**.
34. **Assertions that remain useful:** `wall-v2-authoring-ui.ts` still tests matching no-op, reversed swap, consistent/contradictory votes, malformed failure, validation, W-number independence, and TB immutability (**B** after removing incidence assumptions). `wall-v2-session-ui-path.ts` still covers the real second-click command, state progression, and labels (**B**). `wall-v2-corner-authoring-contract.ts` covers role replacement and authoring constraints (**B**). `wall-v2-corner-architecture.ts` covers geometry architecture and explicitly says topology does not choose roles (**B**). The realistic segmented fixture remains a valuable **C** regression. Geometry diagnostics remain useful for their geometry behavior, not as role semantics.

## 35–41. Future production contract and scope

35. **Proposed API:** repository-consistent minimal form:

   ```ts
   resolveTBOrientationForPanelPair(
     model: SvgDocumentModel,
     assignments: EdgeAssignmentRecord,
     connections: ConnectionMap,
     firstPanelId: string,
     secondPanelId: string,
   ): TBPanelPairOrientation
   ```

   A later refactor could pass an already-built `ReadonlyMap<sourceEdgeId, panelId>` instead of the full model. The API uses typed authored state plus edge-to-panel membership only.
36. **Result type:** use a discriminated union (safer than meeting-named strings): `{ kind: 'NO_TB_ORIENTATION' } | { kind: 'ORIENTED'; firstRole: 'A'; secondRole: 'B' } | { kind: 'ORIENTED'; firstRole: 'B'; secondRole: 'A' } | { kind: 'AMBIGUOUS_TB_ORIENTATION' }`. This is argument-relative, structurally prevents impossible same-role results, and avoids encoding caller variables P/Q in global names.
37. **Can normalization writeback be reused?** **Yes.** Existing normalization already obtains the two W assignments and shallow-copies only their buckets to flip roles. Replace only its oracle/result comparison; preserve matching/no-TB identity returns and ambiguous throw.
38. **Can W1/W2/W3 workflow remain unchanged?** **Yes.** `authorWallEdge` already normalizes the provisional second-click object before completeness/progression and returns the normalized record. Panel-pair lookup changes neither connection allocation nor session/history state.
39. **Risk of overbroad matching:** under the old meeting model, remote same-pair TB looked overbroad; under the locked requirement it is intentionally relevant. P/R and Q/S remain excluded exactly. The only real risk is contradictory same-pair TB, handled explicitly as ambiguity rather than arbitrary selection.
40. **Future top/bottom interaction:** architecture permits multiple TB definitions and does not encode an intentional exception allowing top/bottom between the same panels to oppose. Existing B1 knowledge anticipates a future TB-domain rule requiring same orientation. Until that authoring rule exists, consistent top/bottom votes are safe and opposite votes represent invalid/ambiguous state. Wall must interpret defensively, not invent independent oracles.
41. **Smallest B2.4 production fix:** in `wallAuthoring.ts`, replace `resolveRelevantTBMeeting`'s two-sided `areIncidentPanelEdges` filtering with exact unordered W-panel-pair matching of every complete typed TB; collect argument-relative orientation votes; return no orientation, one consistent orientation, or ambiguity; have existing normalization swap only W roles on reversal. Remove the now-unused adjacency helper/type naming, update focused diagnostics, and make no workflow, geometry, composer, authority, manufacturing, or session/history changes.

## 42–45. Scope, checks, and readiness

42. **Production code changed?** **No.** Only diagnostics and this analysis document changed.
43. **Tests/checks run:** the B2.3A panel-pair matrix, realistic side-by-side reproduction, existing Wall authoring/session/corner diagnostics, full test suite, build, and a production-diff audit. Exact outcomes are recorded in the delivery message.
44. **Commit hash:** recorded in the delivery message after the diagnostic evidence is committed.
45. **Ready for B2.4?** **Yes.** The semantic key, ambiguity policy, source of panel identity, normalization behavior, and non-goals are resolved.

## Explicit conclusions

Wall orientation should be determined by the two panels in the W connection:
**YES**.

TB source-edge adjacency is required for Wall orientation:
**NO**.

TB physical location on the same two panels affects Wall orientation:
**NO**.

A complete consistent TB connection between the same two W panels constrains W:
**YES**.

TB involving any other panel constrains W:
**NO**.

Two consistent TB connections between same panels are safe:
**YES**.

Contradictory TB orientations between same panels fail closed:
**YES**.

Panel-pair-only rule fixes the reproduced manual failure:
**YES**.

Any extra mouse-hole corner rule remains necessary:
**NO**.

Production code modified in this analysis:
**NO**.

Ready for a simplified B2.4 production fix:
**YES**.

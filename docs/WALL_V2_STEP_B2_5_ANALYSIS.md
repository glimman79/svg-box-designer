# Wall v2 Step B2.5 Analysis Report

This is evidence and design analysis only. No production source was changed.

## Part A — panel TB role

1. **Current B2.4 semantic key.** `resolveTBOrientationForPanelPair(firstPanelId, secondPanelId, assignments, connections, model)` iterates TB connection definitions and accepts a vote only when that *one connection* touches both requested panels and is exactly one A plus one B on those two panels.
2. **Why real W2 fails.** After a completed W resolves its two panels, `normalizeWallConnection` asks that pair resolver for guidance. Top's evidence belongs to TB1 while left's belongs to TB4; neither TB touches both, so the resolver returns `NO_TB_ORIENTATION` and normalization deliberately returns the authored assignments unchanged.
3. **Top data.** `top-tb -> { connectionId: 'TB1', edgeRole: 'A' }`; the model maps `top-tb -> top`.
4. **Left data.** `left-tb -> { connectionId: 'TB4', edgeRole: 'B' }`; the model maps `left-tb -> left`.
5. **Right data.** `right-tb -> { connectionId: 'TB2', edgeRole: 'B' }`; the model maps `right-tb -> right`.
6. **Does current top+left resolution require the same TB?** Yes.
7. **Should it?** No. The locked rule resolves each participating wall panel independently.
8. **Exact typed source.** `ConnectionMap[string]` supplies typed `id` and discriminant `prefix`; `EdgeAssignmentRecord[sourceEdgeId]`, normalized with `getBucketEdgeAssignment`, supplies optional `EdgeAssignment.connectionId` and `edgeRole: 'A' | 'B'`; `SvgDocumentModel.panels[].id` and `.edgeIds` provide the stable source-edge-to-panel relation. No geometry, labels, ID-number matching, adjacency, or coordinates are required.
9. **Proposed API.** `resolveTBRoleForPanel(panelId: string, assignments: EdgeAssignmentRecord, connections: ConnectionMap, model: SvgDocumentModel): TBPanelRole` in the Wall authoring domain (repository convention uses `model`, not `svgModel`, in these helpers).
10. **Proposed result.** `type TBPanelRole = 'NO_TB_ROLE' | 'TB_ROLE_A' | 'TB_ROLE_B' | 'AMBIGUOUS_TB_ROLE'` (or an equivalent discriminated union if diagnostics must carry offending IDs).
11. **No usable complete TB:** `NO_TB_ROLE`.
12. **One A:** `TB_ROLE_A`.
13. **One B:** `TB_ROLE_B`.
14. **Multiple complete, consistent A assignments:** collapse to `TB_ROLE_A`.
15. **Multiple complete, consistent B assignments:** collapse to `TB_ROLE_B`.
16. **Usable A+B evidence:** `AMBIGUOUS_TB_ROLE`; Wall normalization fails closed.
17. **Incomplete/malformed TB.** A normal zero/one-assignment draft is not role evidence and is ignored. A purported completed relationship that violates two distinct panels/exactly one A and one B must not vote; safest production treatment when it touches the queried panel is ambiguous/fail closed rather than silently laundering corrupt state. This malformed-state boundary should be encoded explicitly in B2.6 tests.

The authored model supports this cleanly but has one important scope risk: it records TB role per **source-edge assignment**, not a separately declared “wall panel” role. Thus the resolver can aggregate all complete TB assignments on the queried W participant. If a panel may legitimately carry opposite TB roles on different edges, current data cannot identify which TB edge is semantically relevant to a particular W relationship without a new explicit relation (for example, W assignment/connection to relevant TB source-edge or seam). It must report ambiguity, not use a center panel or geometry to guess.

18. **P none / Q none:** unconstrained; preserve the authored valid one-A/one-B orientation.
19. **P A / Q none:** normalize to P=A, Q=B.
20. **P B / Q none:** normalize to P=B, Q=A.
21. **P none / Q A:** normalize to P=B, Q=A.
22. **P none / Q B:** normalize to P=A, Q=B.
23. **P A / Q B:** normalize to P=A, Q=B.
24. **P B / Q A:** normalize to P=B, Q=A.
25. **P A / Q A:** contradictory with Wall cardinality. Do not swap or invent a winner; fail closed. Product clarification is required only if such inconsistent upstream state is intended to be authorable.
26. **P B / Q B:** same contradiction; fail closed and require the same clarification.

Any `AMBIGUOUS_TB_ROLE` on either side fails closed regardless of the other side. The six determined cases follow directly from inheriting every known role plus complementary W cardinality; none/none remains free.

27. **Fixture W1 proposed:** top `W1-A`, right `W1-B`.
28. **Fixture W2 current:** top remains `W2-B`, left remains `W2-A`; the diagnostic calls the production resolver/normalizer.
29. **Fixture W2 proposed:** top `W2-A`, left `W2-B`.
30. **W number relevant?** No.
31. **Edge position relevant?** No, except that stable source-edge membership identifies its panel; physical position is not semantics.
32. **Same TB connection ID required?** No.
33. **Smallest orientation fix.** Replace the pair-connection vote used by Wall normalization/validation with a pure per-panel complete-TB role resolver and the matrix above; retain current W cardinality and role-only swap. Add explicit contradiction errors. Do not touch geometry or downstream composition.

## Part B — trailing placeholder Apply

34. **Exact Apply path.** `App.applyPanelPaths` builds `applyInputs`, recalculates TB/S settings, calls `validateGeometryAuthoring`, then `validateWallAuthoringForApply`. The latter filters every value in the whole `ConnectionMap` whose prefix is `W`, and calls `validateWallConnection` for each. Only after that would TB/S geometry and authority run.
35. **Why empty W3 blocks.** Auto-progression in `authorWallEdge` creates W3 and appends it to `ActiveWallGroup.connectionIds` when W2 becomes complete. Apply's validator does not receive the active group and does not count zero assignments before enumerating the global W map. `getWallAssignments(W3)` returns zero, which fails the exact-two cardinality check.
36. **TB behavior.** TB also auto-creates the next ID and appends it to `ActiveTBGroup.connectionIds`. Apply has no global “every TB definition must be complete” validator: TB geometry derives operations from actual assignments, so a zero-assignment definition contributes nothing. `finishTBGroupWithTrailingCleanup` counts assignments on the group's last connection, deletes it when zero, removes it from group membership, clears selection if it selected that ID, and closes the group.
37. **Reusable?** Yes in policy/counting and cleanup shape; only partially as a direct function because it is TB-typed and Wall already has its own analogous Finish cleanup.
38. **Unused W placeholder.** The final active-group connection, auto-created by progression, with zero W edge assignments.
39. **Started incomplete W.** A W connection with one assignment (and defensively any nonzero malformed set not exactly one A/one B on distinct panels).
40. **Complete W.** Exactly two assignments, exactly one A and one B, on two distinct panels, satisfying non-ambiguous panel-role constraints.
41. **W1 complete + W2 empty:** Apply validates W1 as the batch; W2 does not block.
42. **W1/W2 complete + W3 empty:** Apply validates W1/W2; W3 does not block.
43. **W1/W2 complete + W3 one assignment:** Apply blocks on W3.
44. **Recommended Apply.** Match TB Option A: ignore the active group's zero-assignment trailing placeholder for batch validation and leave authoring/session state intact. Do not mutate React state during validation. Restrict the exemption to the final active-group member; a zero-assignment connection elsewhere is not proven to be an auto-placeholder.
45. **Recommended Finish.** Match existing TB/Wall behavior (Option B at Finish): remove the zero-assignment trailing definition and membership, close the group, and clear assignment/display/edge selection through the existing App transition.
46. **History impact.** Ignoring at Apply preserves the active Wall history row and labels. Finish continues to record the completed group without the placeholder. Passing active group context into Apply validation avoids deleting history state.
47. **Undo/redo impact.** Apply currently does not push an authoring snapshot and should not mutate placeholder state. Finish already calls `pushUndoState`; cleanup and closed-group state therefore remain undoable/restorable as one transition.
48. **Restore impact.** History cloning/restoration already includes connections, assignments, selection IDs, active/completed Wall groups, and group order. A non-mutating Apply changes none of them; Finish restores the captured pre-cleanup placeholder correctly on undo.
49. **Smallest placeholder fix.** Give Wall Apply validation the active Wall group (or a precomputed, explicitly proven trailing-placeholder ID), exclude only its final zero-assignment W from validation/batch selection, and retain validation for every started or malformed W. Keep existing Finish cleanup; optionally align its return shape with TB to expose/clear the removed selection defensively.

## General

50. **Production code changed?** No.
51. **Diagnostics added.** `wall-v2-panel-tb-role-analysis.ts` mirrors center/top/left/right TB1/TB2/TB4 plus W1/W2 and contrasts current/proposed results. `wall-v2-apply-placeholder-analysis.ts` proves current empty-W3 failure and zero-versus-one assignment distinction. Both have package scripts.
52. **Checks.** Both focused diagnostics, TypeScript/Vite build, and the existing Wall B2.4/session diagnostics are run for this evidence commit.
53. **Root causes identified?** Yes: connection-pair TB lookup instead of independent panel roles; global W-definition validation without active trailing-placeholder semantics.
54. **Remaining ambiguity.** A+A/B+B and a panel carrying complete A and B evidence must fail closed unless product policy later defines relevance. Current model has no semantic edge-to-W relevance relation to disambiguate opposite roles. Malformed completed-looking TB state should likewise be pinned down as fail-closed in B2.6.
55. **Exact B2.6 scope.** Wall-only per-panel TB role resolver/result and normalization/validation matrix; Wall Apply batch filtering for the final active zero-assignment placeholder; focused production regression tests. No Wall geometry, TB/S geometry, composer, authority, FinalGeometry, manufacturing, or default-authority changes.
56. **Commit hash.** Recorded in the delivery response after the evidence-only commit.

## Explicit conclusions

**Wall should inherit TB role independently from each W panel: YES.**  
**The two W panels must get their TB roles from the same TB connection: NO.**  
**Top TB1-A + left TB4-B should normalize W2 to top W-A / left W-B: YES.**  
**Panel physical position affects this rule: NO.**  
**W connection number affects this rule: NO.**  
**An auto-created zero-assignment trailing W placeholder should block Apply: NO.**  
**A one-assignment started W connection should block Apply: YES.**  
**Completed W connections before the trailing placeholder form the valid batch: YES.**  
**TB already contains reusable placeholder/session behavior: YES (policy), PARTIAL (direct implementation reuse).**  
**Production code modified in this analysis: NO.**  
**Ready for focused B2.6 production fixes: YES.**

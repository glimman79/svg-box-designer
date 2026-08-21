# Wall v2 Step B2.3 Analysis Report

## 1–7. Scope, production path, and identities

1. **Files inspected:** `src/App.tsx`, `src/app/wallAuthoring.ts`, `src/app/wallWorkflow.ts`, `src/app/assignmentBuckets.ts`, `src/app/authoringRelationships.ts`, `src/app/connectionTypes.ts`, `src/svgUtils.ts`, the three required Wall diagnostics, and the SVG contour construction helpers.
2. **Files changed for diagnostics only:** this report, `tests/diagnostics/wall-v2-real-tb-meeting-analysis.ts`, and its `package.json` command. No production file changed.
3. **Real UI call chain:** an `.edge-hitbox` `onClick` calls `assignSelectedLabelToEdge(edge.id)`. It reads `assignmentTargetConnectionId`, `connections[id]`, and `edgeAssignments`; for W it obtains existing assignments with `getWallAssignments`, checks the active group and replacement claim, then calls `authorWallEdge(svgModel, edgeAssignments, connections, activeWallGroup, id, edgeId)`. That command adds the complementary typed role, calls `normalizeWallConnection`, tests completeness, creates/selects the following W, and returns four next-state values. `App` commits all four and keeps `displayConnectionId` on the completed W. Canvas labels are recomputed from committed `edgeAssignments` by `getEdgeAssignmentDisplayLabels` and `labelPlacementsByEdgeId`.
4. **Second-click function:** `authorWallEdge`. Its second-click inputs are the render snapshot plus the clicked source edge. Its provisional output is `{...assignments, [edgeId]: {edgeAssignment: {connectionId, edgeRole: complementaryWallRole(first.role)}}}`; that exact object is normalized.
5. **W panel P identity:** `assignmentsForConnection` takes the W assignment object's record key as `sourceEdgeId`, then looks it up in a fresh `Map` made from every `model.panels[].edgeIds`. It does not use canvas selection, connection metadata, relationships, or generated geometry.
6. **W panel Q identity:** exactly the same record-key-to-`panel.edgeIds` lookup for the second W assignment. Duplicate source-edge IDs would be resolved to the last panel inserted into the `Map`; ordinary imported IDs are expected to be unique.
7. **TB source:** every value in `connections` whose typed `prefix === 'TB'`; assignments come only from each source-edge bucket's `edgeAssignment` (legacy records are adapted by `toEdgeAssignmentBucket`). Active TB group/session state and canonical claims are not consulted.

## 8–17. Candidate and incidence audit

8. The initial count is **all TB definitions in `connections`**, including incomplete/unassigned definitions. Only definitions with exactly two panel-resolvable, role-bearing edge assignments containing both A and B proceed. In the reproduction, one (`TB1`) is initially considered.
9. For each complete TB, production independently filters its two assignments at the authored W-A panel and W-B panel, requiring the TB source edge to be incident to that panel's W source edge. Both filtered arrays must be nonempty. Thus one complete TB connection supplies both sides; candidates are never assembled across connections.
10. `areIncidentPanelEdges` defines adjacency solely by indices in the deprecated compatibility alias `SvgPanel.edgeIds`: indices differ by one, or by `edgeIds.length - 1` for contour wrap. It does not inspect endpoints, coordinates, `outerContour`, topology nodes, tolerance, raw edge direction, inner contours, or geometric proximity.
11. Yes, incidence is required on both W panels.
12. In the representative box-net topology the correct candidate is `TB1`: `p-tb` (A) on `wall-P` and `q-tb` (B) on `wall-Q`, the same pair carrying W1 on `p-wall`/`q-wall`.
13. `TB1` is considered because it is a typed TB definition and has exactly two typed, panel-resolvable A/B assignments.
14. It is rejected because `atB` in the code's role-relative naming (the authored W-B side, `wall-P` in this reversed case) is empty.
15. Exact reason: `wall-P.edgeIds` is `[p-wall, p-seam, p-tb, p-outer, p-base]`; indices 0 and 2 neither differ by one nor wrap. The intervening imported segment makes the semantic meeting invisible to index adjacency.
16. Rejection occurs on `wall-P`; `wall-Q` passes because `q-wall` and `q-tb` are first/last and therefore wrap-adjacent.
17. The evidence IDs are W `p-wall`/`q-wall` and TB `p-tb`/`q-tb`. The unavailable manual screenshot/model was not serialized in the repository, so claiming its runtime-generated `edge-*` IDs would be fabrication; the fixture provides stable representative IDs and the same failure mechanism.

## 18–25. Isolation, orientation, normalization, and writeback

18. **Partial.** A surviving vote necessarily has one incident assignment on each W panel, but the resolver first scans all TB definitions and does not explicitly require the TB assignment set's panel pair to equal the W pair. With exactly two TB assignments, both nonempty side filters prove the pair in the normal distinct-panel case.
19. An unrelated P+R or Q+S TB cannot vote: it cannot make both `atA` and `atB` nonempty. A TB elsewhere on the same P+Q pair can constrain W if both of its edges happen to be index-adjacent to the W edges, even if that is not the intended physical meeting; therefore the rule is representationally too broad as well as semantically narrow.
20. **No.** Both `atA` and `atB` are computed inside one `for (connection of Object.values(connections))` iteration from one `tb` array.
21. Orientation uses the assignment record key (`sourceEdgeId`), `bucket.edgeAssignment.connectionId`, `bucket.edgeAssignment.edgeRole`, the panel mapped from `panel.edgeIds`, and the current `connections` snapshot. If the assignment incident to the authored W-A edge has `edgeRole === 'A'`, the vote is `W_A_SIDE_IS_TB_A`; otherwise it is `W_A_SIDE_IS_TB_B`. No group/session snapshot is read.
22. The representative/manual-class topology resolves to `NO_TB_MEETING`: the intended complete same-pair TB is filtered before voting.
23. `normalizeWallConnection` returns the input object for incomplete/malformed W, `NO_TB_MEETING`, and matching orientation. It swaps only for `W_A_SIDE_IS_TB_B`, and throws for ambiguous/contradictory evidence. Therefore the reproduction's reversed W remains reversed.
24. A swap shallow-copies the assignment record and each of the two affected buckets/edge assignments, flips A/B, and returns it. `authorWallEdge` uses that return for completeness and returns it to `App`; `App` passes it directly to `setEdgeAssignments` before selecting the new W while displaying the completed W.
25. No later second-click branch writes the provisional pre-normalized assignment. React batching does not alter the explicit next object. W2 allocation uses normalized assignments locally only for completeness (not role choice); the next click occurs after render and receives committed state. Label projection reads committed state. No stale-write overwrite path was found.

## 26–33. Coverage gap, reproduction, multiple TB, and rule width

26. `wall-v2-tb-panel-pair-orientation.ts` and `wall-v2-authoring-ui.ts` call resolver/normalizer helpers with synthetic arrays where W index 0 and TB index 1 are adjacent on both panels. `wall-v2-session-ui-path.ts` does use the production `authorWallEdge`, but repeats the same `p0/p1`, `q0/q1` topology. None parses a real/import-like segmented box net. They use the correct bucket and panel-ID mechanisms and can include multiple TBs, but omit the decisive contour segmentation/meeting identity.
27. Previous tests passed because they proved the command and swap writeback **after** manufacturing an accepted adjacency vote; they did not prove that production finds the oracle in the browser topology.
28. The new five-panel base-plus-four-walls diagnostic uses native TB buckets, a complete same-pair TB, reversed W, and the exact production `authorWallEdge` command. It reports `TB1`, both panels, both incidence results, rejection, `NO_TB_MEETING`, and unchanged B/A roles, then deliberately fails.
29. **Yes**, the product-visible symptom (no auto-swap despite complete typed TB on the same W panels) is reproduced automatically.
30. Remaining gap: no screenshot project serialization was supplied, so exact browser edge IDs and whether its extra separation is intentional topology or imported segmentation cannot be compared byte-for-byte.
31. Multiple TBs vote through a set: consistent surviving meetings collapse to one vote; opposite surviving orientations become ambiguous; rejected intended meetings contribute nothing. There is no priority/selection. Multiple connections on one panel but not both W panels cannot combine.
32. **Yes.** Direct `edgeIds` neighbor status on both panels is narrower than the locked requirement and is fragile to segmentation or a semantically relevant meeting represented beyond one contour segment.
33. **Yes, in a different dimension.** Bare cyclic index adjacency lacks a semantic corner/meeting identifier, so an unrelated same-panel-pair TB that happens to neighbor both W edges can vote.

## 34–41. Recommended B2.4 contract and scope

34. Use **the exact same W panel pair plus one complete TB connection plus stable physical-meeting identity at both sides**. Prefer an existing/canonical source-edge topology relationship graph that can associate each W side with the TB side at the intended physical meeting across segmented runs. Do not revert to global same-panel-pair voting.
35. Yes. Same W panels are mandatory but not sufficient.
36. Add/consume a segmentation-stable meeting identity: canonical endpoint/topology-node or canonical contour-run/corner relationship connecting each W source edge to its TB source edge on both panels. It must survive transforms, reversal, and collinear subdivision and identify the same TB connection at both sides.
37. Smallest likely correction: replace `areIncidentPanelEdges`' immediate array-index predicate in `resolveRelevantTBMeeting` with that canonical meeting relation, while retaining complete typed TB, exact two W panels, same-connection, vote, ambiguity, and role-swap behavior.
38. Production code changed: **No**.
39. Checks: the new diagnostic (expected failure evidence), the three existing Wall diagnostics, full build, and production-diff audit.
40. Commit hash is recorded in the delivery message after committing this evidence.
41. B2.4 should be limited to the resolver's topology lookup and focused regression fixtures: reproduce the actual serialized project if obtainable; resolve semantic incidence across segmentation; enforce exact W panel-pair and same TB connection; preserve ambiguity behavior and writeback; do not change TB authoring, workflow/session/history, composer/authority, FinalGeometry, manufacturing, or implement Wall geometry.

## Explicit conclusions

Current W normalization reads TB from the same two W panels: **PARTIAL**.

Current relevant-TB rule identifies the manual screenshot case: **NO**.

The correct TB connection is currently filtered out: **YES**.

Current contour-adjacency rule is too narrow: **YES**.

Unrelated TB can constrain W: **YES** (only a complete same-pair TB that accidentally passes both index-adjacency predicates; P+R/Q+S cannot).

Current automated tests represent the real browser topology accurately: **NO**.

The manual auto-swap failure is reproduced in diagnostics: **YES**.

The exact root cause is identified: **YES** (loss of the intended TB vote at immediate `panel.edgeIds` adjacency filtering).

Production code modified in this analysis: **NO**.

Ready for a focused B2.4 production fix: **YES**.

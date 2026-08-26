# Generic Post-Composition Profile Reconciliation Architecture Report

## Scope and conclusion

This is a read-only architecture analysis of the checked-in pipeline. It changes no generator, adapter, composer, packaging, `FinalGeometry`, authority, snapshot, or manufacturing behavior. The central recommendation is a pure, contributor-neutral reconciliation service **after a successful panel composition and before authoritative packaging**. Generator output remains immutable provenance; the service derives a final-contour metadata view and explicit mapping evidence.

The current code already contains a narrow preview of this idea in `packageComposedPanelGeometry`: it matches a projection to a candidate segment by lineage, rewrites a copied endpoint pair, and in mixed cases drops an unmatched non-zero projection. That logic is not a sufficient contract: it is embedded in packaging, models only zero-or-one directed segment, treats contributor count as policy, preserves stale unmatched projections for single-tool cases, does not reconcile taps/groups/attachments/relationships, and can silently drop required physical semantics.

---

## CURRENT STATE

### 1. Current pipeline

| Stage | Data owner and mutability | Semantic identity | Physical coordinates | Scope / authority |
|---|---|---|---|---|
| Authoring | UI/project state owns connection definitions, edge-assignment buckets, and Wall/TB workflow state. State is mutable through authoring commands. | Connection/operation intent, role, `panelId`, `sourceEdgeId`; normalized relationships later add contributor provenance. | Selected imported source edges; no generated contour yet. | Contributor intent, not physical authority. |
| Generation | TB, W, and S generators create fresh `GeneratedGeometryItem`s, `GeneratedProfile`s, `GeneratedTapGroup`s, profile groups, and source relationships. `GeneratedProfile` is deeply frozen; other output is treated as value data. | Tool, operation, connection, panel, source edge, profile, element, projection, and tap lineage. | Generator-local complete panel paths, attachment/support points, tap points, and directed projection endpoints. | Contributor-local shadow. A generator's same-tool panel batch is internally coherent, but does not know the eventual cross-contributor ring. |
| Adapter | The contributor registry selects a tool-neutral `adaptProfiles` function. TB and W currently share the TB shadow adapter. | Carries `operationId`, `profileId`, `sourceEdgeId`, `elementId`, `projectionId`, `tapId`, and tap role. | Converts profile projections and supports to `PanelReplacedEdgeContribution.geometry`. | Contributor-local candidates, not final authority. |
| Relationship audit/index | Normalizes `replaces`, `references`, and feature relations; detects duplicate/conflicting ownership. | Stable source tuple `(panelId, sourceEdgeId)` and operation/contributor provenance. | None beyond references to generated features. | Authoritative for ownership claims, not contour membership. |
| Composer | `composePanel` consumes the imported source ring, indexed claims, and adapted replacements. It does not mutate inputs. | Preserves lineage on every emitted `PanelCandidateSegment`; unchanged segments retain source edge identity. Junctions identify their before/after source edges. | Resolves adjacent support intersections, substitutes the resolved first/last endpoint, omits zero-length segments, and emits one closed candidate traversal. Upstream generators/path services may already simplify their local paths; the checked-in composer itself does not implement a general collinear coalescer or inverse-pair pass. | A successful candidate is the first complete, contributor-neutral physical result. |
| Packaging | `packageComposedPanelGeometry` merges owner carriers into a copied composed `PANEL_PATH`, unions profiles/taps/groups/relationships, and currently performs a limited projection endpoint rewrite/drop. | Retains original profile/tap/group IDs; creates a composed carrier/operation ID. | Serializes `candidate.points` to `pathD`; copied projections can be rewritten. | Authoritative transport/persistence representation after authority selection. |
| `FinalGeometry` | Pure derivation from imported model plus selected generated items. It copies generator shadows through and decorates final contour segments. | Builds final contour IDs and per-segment profile/tap/source-edge arrays. | Parses the selected `PANEL_PATH`; projection matching is exact directed coordinate matching within shared tolerance. | Consumer of authoritative path, not the place that creates composition authority. |
| Manufacturing | Purely derives compensated contours and masks from `FinalGeometry`; generated profile shadow is carried through. | Uses final segment profile/tap IDs, tap roles, source-edge IDs, and selected profile IDs. | Offsets/kerf/clearance operate on final-contour coordinates. | Downstream physical derivative; it must trust reconciled final membership. |

### 2. Current authoritative contour stage

**Architectural answer:** geometry becomes physically authoritative when `composePanel` has returned a diagnostic-free `PanelCandidate` for the whole panel. This is the first object that has seen every owning contribution and every shared junction in source-edge traversal order. The candidate's closed segment ring—not any contributor's full-panel carrier—is the composition result.

**Deployed transport answer:** production selects and persists the packaged composed `PANEL_PATH`; therefore its parsed path is the durable authoritative contour supplied to `FinalGeometry`. Packaging must be a lossless serialization of the successful candidate. `FinalGeometry` does not become authority merely by parsing it, and manufacturing is still farther downstream.

Thus there is one semantic answer: **the successful composed candidate ring is the authoritative physical result; packaged `PANEL_PATH` is its canonical carrier**. Later systems trust final segment membership derived from that ring plus reconciliation evidence.

### 3. Current projection matching stage

`identifyProfileGroups` in `FinalGeometry` iterates every non-zero `GeometryProjection` and searches the parsed final contour for exactly one segment whose start and end match in the same direction. Zero matches produce `CLEARANCE_PROFILE_MISSING`; multiple matches or conflicting profile ownership produce `CLEARANCE_PROFILE_AMBIGUOUS`. Zero-length projections are ignored. This is coordinate validation/decoration, not semantic reconciliation.

`identifyGeneratedTaps` separately searches each of the three `GeneratedTapGroup.points` segments by directed coordinates. Missing tap segments are silently unlabelled; it does not consume the profile projection result or report equivalent diagnostics.

### 4. Current reconciliation behavior

Before calling `FinalGeometry`, packaging currently:

1. restricts candidate segments by `(profileId, operationId, sourceEdgeId)`;
2. prefers equal `projectionId`, otherwise tries one equal directed coordinate segment;
3. preserves a zero-length projection;
4. rewrites a copied projection's endpoints to its one matched candidate segment;
5. retains an unmatched projection for a single contributor, but drops it when more than one contributor type is packaged.

It does not produce mapping evidence or diagnostics, cannot reverse/split/coalesce, and leaves attachments, profile groups, `GeneratedTapGroup.points`, element links, and relationships untouched.

### 5. Current failure seam

The seam is between **candidate composition** and **metadata packaging**. Composer changes first/last endpoints at shared junctions and may omit a zero-length terminal, while the metadata union still begins as independent generator-local shadows. The limited `remapProfile` function only repairs one projection-to-one-segment endpoint changes. Stale tap coordinates, attachments, groups, or unmatched projections can therefore reach `FinalGeometry`; mandatory metadata may also be silently dropped in a mixed package.

### 6. Why same-tool composition behaves differently

The evidence supports, with an important qualification, coherent generation as the explanation—not tool identity in `FinalGeometry`:

* `buildGeneratedTBGeometryItems` processes all TB operations on a panel as one batch, computes role-effective geometry/junctions for that batch, and creates profiles from those shared junctions.
* W delegates to the same physical TB kernel and has equivalent output modulo tool identity in the existing exact-equivalence diagnostic.
* Single-tool authority tests assert that composed metadata equals the legacy generator carrier, including profile projections and taps, across adjacent/opposite/all-edge cases. This demonstrates that those fixtures enter packaging already coherent; packaging does not need to invent cross-batch semantics.

It is not correct to claim every possible TB+TB topology is proven reconciled. The checked-in evidence shows the tested same-tool batches agree with their legacy full-panel oracle. Generic post-composition validation must still run for TB+TB and W+W.

### 7. Why cross-tool composition exposes stale metadata

TB and W are generated in separate calls and adapted as independent profile sets. Each generator can be internally correct relative to its own full-panel construction, yet neither can anticipate the other tool's neighboring support/junction. The composer then chooses one physical junction for their shared corner. Packaging unions both shadows after that choice. This cross-tool union is the architectural seam: independent “current contour” projections are treated as if they described the new common contour. Same-tool coherence reduces the incidence; it does not justify contributor-count-dependent semantics.

---

## DATA SEMANTICS

### 8. GeneratedProfile ownership

A `GeneratedProfile` is generator-owned, immutable, and explicitly documented as a non-authoritative shadow of one directed edge replacement. Its profile/element/tap topology and provenance are semantic. Its source direction, attachments, and `geometryProjections` are generator-local coordinates. Reconciliation must never overwrite this object.

### 9. GeneratedTap ownership

A `GeneratedTapGroup` is generator-authored provenance for one male tab. `id`, operation/panel/source-edge lineage, ordering, and three segment roles are semantic. Its four points are a generator-local projection of those semantics. Tap role must survive when a physical segment survives; tap coordinates need the same final mapping discipline as profile projections.

### 10. Projection ownership

`GeometryProjection` belongs to a generated profile element. Its ID and links are provenance; `start`/`end` are a claim about the then-current directed contour, not lasting physical truth. A final mapping is derived and panel-authoritative, while the original projection remains contributor-owned.

### 11. Source-edge ownership

Ownership is exclusively the normalized relationship rule: at most one `replaces` operation for `(panelId, sourceEdgeId)`. `references` never owns. Profile IDs, tap IDs, coordinates, contributor order, or corner contact cannot grant ownership.

### 12. Corner/junction ownership

Neither neighboring contributor exclusively owns a shared corner. The source topology owns its junction identity `(panelId, beforeSourceEdgeId, afterSourceEdgeId)`; the composer owns the resolved physical point for this composition. Contributors own their terminal intent/support and provenance, not the final point.

### 13. Immutable vs derived data

Keep authored state and original generated profiles/taps immutable. Derive:

* final segment identities and topology;
* original-projection-to-final-segment relations;
* reconciled projection/tap/group/attachment views required by legacy consumers;
* diagnostics and matching evidence.

Remapped copies ease migration but risk presenting a copy as original provenance. The durable model should be a mapping table; compatibility projection copies should be explicitly named as a derived view.

### 14. Stable lineage keys

| Field | Classification | Use |
|---|---|---|
| `panelId` | **STABLE SEMANTIC KEY** | Reconciliation partition; never sufficient alone. |
| `sourceEdgeId` | **STABLE SEMANTIC KEY** | Source topology/ownership partition, paired with panel. |
| `operationId` / `sourceOperationId` | **STABLE SEMANTIC KEY** within one generation epoch | Contributor intent/provenance and conflict detection. A composed carrier operation ID is not a replacement for source operation lineage. |
| `profileId` | **STABLE SEMANTIC KEY** | Persistent identity of one boundary profile; includes contributor/connection/panel/edge today. |
| `elementId` | **STABLE SEMANTIC KEY** | Best semantic unit for mapping; carries profile-local order/kind. |
| `projectionId` | **STABLE SEMANTIC KEY for origin lookup**, not final segment identity | Deterministically derived from element today; may map to zero, one, or many final segments. |
| `tapId` | **STABLE SEMANTIC KEY** | Tap provenance across profile, contour, and manufacturing. |
| tap role | **STABLE SEMANTIC ATTRIBUTE** | Meaning of a mapped primitive; not unique as a key. |
| attachment/group IDs | Group/profile ID is stable; attachment coordinates are not | Attachment semantic role needs explicit start/end identity. |
| relationship provenance / provenance ID | **STABLE SEMANTIC KEY** | Evidence for owns/references/creates; validate, do not infer from geometry. |
| contributor type | **STABLE SEMANTIC ATTRIBUTE** | Provenance/registry dispatch only; never matching priority. |

### 15. Transient identity fields

| Value | Classification | Rationale |
|---|---|---|
| projection `start`/`end`, tap points, attachments, candidate endpoints | **PHYSICAL COORDINATE** | Evidence and validation only; never a global semantic key. |
| `profileSegmentOrder`, `profileOrder`, `tapIndex` | **DISPLAY/LOCAL ORDER** | Useful to order relations within a profile, unsuitable alone for cross-composition identity. |
| `segmentIndex` | **TRANSIENT GENERATED ID** | Changes with ring start, split, coalesce, or removal. A durable final segment ID must be derived from canonical topology, not this index alone. |
| raw/composed carrier `id` and composed operation ID | **TRANSIENT GENERATED/TRANSPORT ID** | Identifies a package, not a physical segment or source operation. |
| connection ID | **STABLE AUTHORING/DISPLAY ID** | Useful through profile/operation provenance but insufficient alone. |
| coordinate coincidence | **UNSUITABLE FOR RECONCILIATION alone** | Repeated, reversed, overlapping, and zero-length geometry is possible. |

---

## PROJECTION CONTRACT

### 16–23. Lifecycle states

All physical projection kinds currently share `kind: current-contour-segment`; the semantic element kinds are `boundary-run`, `tap-leading-wall`, `tap-tip`, and `tap-trailing-wall`. Tap groups add three direct point segments with `tap-side-start`, `tap-tip`, `tap-side-end` (and the wider role vocabulary includes source-boundary and corner-closure). Profile/group attachments are endpoint anchors, relationships are topology references rather than contour segments. Their required lifecycle is:

| State | Required meaning | Profile element projections | Tap point segments/roles | Attachments/groups | References/relationships |
|---|---|---|---|---|---|
| **PRESERVE** | Same directed final primitive and endpoints. | Keep one mapping. | Keep role on that primitive. | Keep final endpoint mapping. | Preserve provenance unchanged. |
| **REMAP** | Same semantic primitive, changed endpoints or final ID. | One origin → one final segment; retain origin ID in evidence. | Derive points/segment decoration from the same mapping. | Derive new physical anchor, retain start/end role. | Remap physical target view, not relationship kind. |
| **REVERSE** | Same primitive, opposite traversal. | One origin → one final segment with orientation `REVERSED`; do not swap semantic leading/trailing silently. | Reverse endpoint view while retaining semantic tap role; consumers must use orientation. | Start/end anchors map explicitly and may exchange traversal position. | Provenance unchanged. |
| **SPLIT** | One semantic primitive occupies multiple ordered final primitives. | One origin → ordered `finalSegmentIds[]` with coverage intervals. | A role can decorate every covered child or use role-specific policy declared by the semantic element. | Anchor maps to boundary nodes, not every child. | No ownership change. |
| **COALESCE** | Several origins occupy one final primitive. | Each origin maps to the same final segment; reverse index exposes all origins. Conflicting physical policies fail. | Multiple compatible semantic decorations may coexist; incompatible roles fail closed. | Several anchors may resolve to one node. | Provenance remains many-to-one. |
| **DROP_NONPHYSICAL** | An explicitly optional/bookkeeping primitive has no physical final segment. | Mapping status records intentional removal and evidence/reason. It is not an unreported array deletion. | Never discard a required tap wall/tip merely because it is absent. | A redundant local closure may drop; semantic attachment identity remains. | Relationship itself remains unless its authored semantics say it is derived-only. |
| **ZERO_LENGTH_SEMANTIC** | Intentional metadata-only element survives without physical membership. | No final segment; preserve element and explicit status. | Only allowed where contract declares zero-length semantics; no clearance mask segment. | Can map to a final topology node. | Provenance unchanged. |
| **AMBIGUOUS** | Lineage/topology admits no unique mapping. | Error diagnostic; no guessed membership. | Error for required tap semantics. | Error if required; warning only for explicitly optional display anchors. | Ownership/provenance conflicts are blocking. |

Coordinates can corroborate lineage and compute coverage, but classification must begin with panel, source edge, operation/profile/element/projection lineage and explicit candidate lineage. Current one-projection/one-directed-segment matching is insufficient for split, coalesce, and reverse.

---

## ARCHITECTURE

### 24. Recommended reconciliation owner

Add a **pure generic reconciliation service at the composition/packaging boundary**. It receives a successful immutable `PanelCandidate` (or a strengthened composed-contour type), original generated metadata, normalized relationships, and explicit tolerances. It returns an immutable reconciled metadata view, mapping evidence, and deterministic diagnostics. Authority packaging runs only on a non-blocking result.

### 25. Why not generator

The generator cannot see other contributors or the authoritative shared junction. Asking it to reconcile would require regenerating after global composition, create cycles, and destroy coherent local provenance. Generators should continue emitting their best internally coherent batch and complete lineage.

### 26. Why not tool-specific adapters

Adapters should translate contributor output into the common contribution contract. A TB adapter cannot know future X semantics, and a W adapter editing TB yields pairwise branches. With *n* tools, directional mutation rules approach *n(n-1)* and become order-dependent. Adapters may validate/provide lineage but must not reconcile another tool.

### 27. Why not panelComposer

Composer should decide physical topology and retain lineage, not understand profile/tap/manufacturing schemas. Folding reconciliation into it couples topology algorithms to consumers, complicates split/coalesce representation, and makes composer changes risk metadata behavior. It may emit stronger evidence—junction node IDs, segment ancestry, simplification events—but the separate service interprets it.

### 28. Why not FinalGeometry-only guessing

`FinalGeometry` currently has only packaged path plus generator shadows and guesses by global directed coordinates. It has lost composer events and candidate ancestry. It cannot distinguish intended drop from missing data, split from coincidence, or legitimate coalescence from conflict. It should validate/consume explicit mappings, retaining coordinate fallback only for legacy snapshots.

### 29. Proposed service/API

Conceptually:

```ts
reconcileComposedPanelMetadata({
  contour: ComposedPanelContour,
  profiles: ReadonlyArray<GeneratedProfile>,
  taps: ReadonlyArray<GeneratedTapGroup>,
  profileGroups: ReadonlyArray<GeneratedProfileGroup>,
  relationships: GeometryRelationshipIndex,
  policy: ReconciliationContractVersion,
}): ReconciliationResult
```

The service has no UI state, contributor priority, contributor pair, or tool-specific argument. Inputs and outputs are readonly. Stable sorting and canonical ring/segment identity make the output independent of generated-item order.

### 30. Proposed output model

Minimal conceptual model:

```ts
type ProjectionMappingStatus =
  | 'PRESERVED' | 'REMAPPED' | 'REVERSED' | 'SPLIT'
  | 'COALESCED' | 'DROPPED_NONPHYSICAL' | 'ZERO_LENGTH_SEMANTIC';

type FinalSegmentRef = Readonly<{
  finalSegmentId: string;
  orientation: 'FORWARD' | 'REVERSED';
  coverage: Readonly<{ from: number; to: number }>;
}>;

type ReconciledProjectionMapping = Readonly<{
  originalProjectionId: GeometryProjectionId;
  profileId: GeneratedProfileId;
  elementId: GeneratedProfileElementId;
  operationId: string;
  panelId: string;
  sourceEdgeId: string;
  finalSegments: ReadonlyArray<FinalSegmentRef>;
  status: ProjectionMappingStatus;
  evidence: ReadonlyArray<LineageOrTopologyEvidence>;
}>;

type ReconciliationResult = Readonly<{
  contour: ComposedPanelContour;
  projectionMappings: ReadonlyArray<ReconciledProjectionMapping>;
  finalSegmentOrigins: ReadonlyMap<string, ReadonlyArray<OriginalSemanticRef>>;
  derivedProfiles: ReadonlyArray<ReconciledGeneratedProfileView>;
  derivedTaps: ReadonlyArray<ReconciledTapView>;
  derivedAttachments: ReadonlyArray<ReconciledAttachmentView>;
  diagnostics: ReadonlyArray<ReconciliationDiagnostic>;
}>;
```

`coverage` makes split order explicit and allows partial coalescence. A reverse index makes coalescence first-class. `finalSegmentId` should derive from canonical panel topology plus a deterministic post-composition segment key; it must not be a bare mutable array index.

### 31. Relation to packaging

Packaging becomes a serializer/union boundary, not a matcher. It packages the candidate path and reconciled derived view only after checking there are no blocking diagnostics. Original provenance can be retained in a separate shadow field or mapping origins; it must not be confused with current-contour coordinates.

### 32. Relation to FinalGeometry

New-schema `FinalGeometry` consumes final segment mappings by stable final segment identity and validates that mapped segments exist. It should not rediscover them by coordinate equality. Legacy snapshots without mappings may continue through the current coordinate matcher behind an explicit legacy schema path, with existing diagnostics.

### 33. Relation to manufacturing

Manufacturing consumes final per-segment semantic decorations produced from reconciliation: profile membership, tap ID/role, and source-edge membership. It should preserve multiple origins where needed and reject incompatible coalesced policies. Offset/clearance selection still uses stable profile/tap IDs, not copied profile object identity.

### 34. Relation to snapshots

Today snapshots persist selected `GeneratedGeometryItem[]`, including composed path and packaged generated shadows, and restore them directly. Prefer derived reconciliation on restore when raw provenance, relationships, and authoritative contour are present. Introduce a schema/version marker and either:

1. persist original generated metadata + composed contour and deterministically rerun reconciliation (preferred); or
2. additionally persist mappings as a cache, validate their contract/version/hash, and rerun when stale.

Old snapshots lack composer event evidence, so migration can use legacy exact matching only where unique. Ambiguous legacy data must fail closed rather than fabricate lineage. A migration is needed only when new mappings become required; this report makes no schema change.

---

## MULTI-CONTRIBUTOR

### 35. TB+TB

Keep coherent TB panel batching. Its internally shared junction/profile metadata is valuable and existing equality tests protect it. Still run generic reconciliation as an idempotent validation: expected states are mostly `PRESERVED`, with explicit remap/drop only when the actual composed candidate proves it.

### 36. W+W

Use the same contract. W uses the shared physical kernel and contributor adapter; no W-only reconciler is justified. Multiple W operations in one W batch should remain coherent before normalization.

### 37. TB+W

Generate independently, compose by source-edge ownership, then reconcile both immutable metadata sets against one candidate. At an adjacent corner, both terminal projections may remap to the composer-owned junction; neither tool edits the other. Distinct/opposite edges usually preserve. Input reversal/rotation/winding must not change semantic results.

### 38. TB+W+S

S `references` remain non-owning and its slot features remain created geometry. If S also emits reference/profile attachment metadata that points at the panel boundary, derive a reference-target mapping to the final contour without converting it to `replaces`. Physical slots retain their own geometry authority and relationship provenance.

### 39. Future X

A future contributor supplies:

* registered contributor identity and a generic adapter;
* normalized source-edge claims (`replaces`, `references`, `creates`);
* immutable generated segments with panel/source/operation/profile/element/projection lineage;
* semantic profile elements, tap-like roles or an extensible decoration vocabulary;
* attachment/reference roles tied to source topology;
* declared optional/nonphysical and zero-length semantics.

It needs no branch in composer, reconciliation, `FinalGeometry`, or manufacturing when it uses existing semantic decorations. A genuinely new manufacturing semantic naturally requires a new generic decoration consumer, not X-pair rules.

### 40. Same-edge conflict

Two `replaces` claimants for the same `(panelId, sourceEdgeId)` block before composition. Reconciliation cannot arbitrate, prioritize by tool/order, or turn one into a reference. Diagnostic: `INVALID_REPLACEMENT_OWNERSHIP` with both provenance chains.

### 41. REFERENCES behavior

References never gain contour ownership or profile membership through remapping. Reference metadata may map to final segment(s) or junction node(s) for locating attachments/slots, with status/evidence parallel to projections. A missing *required* reference target blocks its dependent feature; an optional display reference may warn. The original relationship remains `references`.

### 42. Deterministic contributor order

Partition by panel, use source-ring order for topology, stable-sort metadata by semantic keys, canonicalize final ring identity, and sort diagnostics by `(category, panel, source edge, operation, semantic ID)`. Never select “first contributor,” “last carrier,” or array-order coordinate match. Reversing raw item order must produce byte-equivalent mappings and diagnostics.

---

## CORNERS

### 43. Mixed contributor corner

For TB edge A beside W edge B, the corner is one topological node shared by both edge contributions. The composer resolves its coordinate from both supports and its terminal preservation rule. Reconciliation maps the terminal coverage/attachment of each profile to that node and adjacent final segment(s).

### 44. Endpoint movement

When the composer replaces a contributor-local terminal with the resolved junction, classify the surviving terminal segment `REMAPPED`; update only the derived final view. If movement collapses the segment, it is `DROPPED_NONPHYSICAL` only when the element contract permits removal, otherwise `REQUIRED_PHYSICAL_MISSING`.

### 45. Corner semantic ownership

Make junction identity explicit as `(panelId, beforeSourceEdgeId, afterSourceEdgeId)` plus a canonical node ID and physical coordinate. It is source-topology/composition-owned. Both contributors may cite the node. Coordinate-only identity cannot distinguish repeated/touching geometry or explain which adjacent edges established the point.

### 46. Terminal tap behavior

A terminal tap's `tapId`, element ID, and role remain contributor provenance. Its wall/tip projection maps to final segments using element lineage and composer ancestry. A changed endpoint is a remap; reversal is explicit; collapse is allowed only if that terminal role is declared nonphysical. `GeneratedTapGroup.points` must receive a derived final view consistent with the profile mapping instead of being independently guessed later.

### 47. Split/coalesced corner segments

If junction normalization inserts a node inside one projection, record one origin mapping to the ordered child segments (`SPLIT`). If simplification merges collinear terminals from multiple origins, record every origin against the one segment (`COALESCED`) and retain coverage/orientation. Profile ownership can be many-to-one at the evidence layer; incompatible final manufacturing decoration is blocking rather than last-writer-wins.

### 48. Mouse-hole rule separation

The layers remain independent:

* **AUTHORING:** Wall workflow chooses/normalizes W-A/W-B and prevents the mouse-hole configuration.
* **PHYSICAL PIPELINE:** W uses shared finger-joint generation and generic panel composition.
* **POST-COMPOSITION:** reconciliation maps all contributor metadata to the final contour without knowing “mouse hole,” W-A, or W-B.

Reconciliation must not repair an invalid Wall authoring decision or use Wall roles as contributor priority.

---

## COMPATIBILITY

### 49. TB legacy risk

High-risk assertions compare complete generated profiles/projections, taps, groups, `FinalGeometry`, manufacturing, snapshot restore, and order independence. Other tests inspect exact terminal projection coordinates, profile/tap IDs, element counts/order, attachment vertices, and one projection per element. Preserve semantic IDs and original shadows; update tests that incorrectly equate generator-local coordinates with final-authoritative coordinates. Keep separate tests for raw provenance equality and final mapping validity.

### 50. W risk

W equivalence to TB and W-only manufacturing must remain. A generic service could expose previously silent tap-point misses or optional terminal collapse. Do not weaken failures merely to keep W snapshots byte-equal; classify optionality explicitly and retain original W provenance.

### 51. Snapshot risk

Existing snapshots store packaged metadata and assert byte-for-byte restore. Replacing stored profiles with derived copies would break equality and could make reconciliation non-repeatable. Version the schema, preserve old restore behavior under the legacy path, and make new mapping derivation deterministic/hash-validated.

### 52. Profile/tap ID risk

IDs are user selection and manufacturing linkage keys. Never mint new semantic profile/tap IDs merely because geometry split or reversed. New IDs belong only to final physical segments/mapping records. A split creates multiple final references under the same projection/element origin.

### 53. Manufacturing risk

Profile offset and tap clearance rely on correct segment masks and roles; stale mappings can compensate the wrong segment, while silent drops can omit compensation. Kerf/slot behavior can change indirectly when contour segmentation changes. Golden tests must compare physical output and semantic masks across exact/remap/reverse/split/coalesce cases.

### 54. FinalGeometry risk

Its current one-to-one directed matcher and error codes are legacy constraints, not the desired data model. Introducing mappings requires a staged consumer path. Until that consumer supports split/coalesce, reconciliation must return `UNSUPPORTED_CONSUMER_MAPPING` and block authority rather than flatten or guess.

---

## IMPLEMENTATION PLAN

### 55. Minimal Step 1

Add types and a pure **shadow validator/reconciler** beside composition, with no authority change. Strengthen candidate output with canonical junction IDs, final segment IDs, and ancestry/simplification evidence. Return mapping records and diagnostics for exact/remap/reverse/drop/zero-length; detect split/coalesce but report them unsupported. Dual-run it across existing fixtures and capture deterministic evidence. Do not rewrite packaged metadata.

### 56. Minimal Step 2

After Step 1 is green and reviewed, make packaging consume the generic result project-atomically. Add derived projection/tap/attachment views and mapping records, then teach `FinalGeometry` to consume explicit final mappings. Remove contributor-count policy and coordinate guessing only for the new schema. Retain legacy fallback for old snapshots.

### 57. Migration/compatibility step

Add a reconciliation contract/schema version and an explicit legacy restore adapter. Prefer rerunning from persisted originals plus composed contour. If exact composer ancestry cannot be reconstructed, accept only unique lineage+geometry mappings; mark ambiguous snapshots blocked. Consider persisting canonical composer event evidence for new snapshots, but treat mappings as a reproducible cache.

### 58. Tests before implementation

First freeze today’s evidence separately for (a) raw immutable provenance and IDs, (b) candidate physical ring and lineage, (c) packaged path, (d) `FinalGeometry` membership/diagnostics, and (e) manufacturing. Add naturally red shadow-contract fixtures for endpoint remap, reverse, split, coalesce, removed required/optional terminal, zero-length semantic, ambiguous repeated segment, and stale tap/group attachments.

Required matrix:

| Configuration | Variants / assertions |
|---|---|
| TB-only; W-only | A/B roles, one/all edges, raw reversal, stable IDs, all projections accounted for. |
| TB+TB; W+W | adjacent/opposite/three/all edges; coherent batch remains idempotently reconciled. |
| TB+W distinct edges | same panel adjacent and non-adjacent/opposite; both contributor orders. |
| TB+W orientation | 90°/arbitrary rotation, CW/CCW contours, reversed raw edge records, reversed generated traversal where valid. |
| TB+W corner | endpoint movement, terminal tap, terminal collapse, corner node shared by both origins. |
| TB+W+S | S reference target remaps, S never owns, slot provenance survives. |
| future X | registry-only synthetic contributor passes without downstream branch. |
| Mapping cardinality | preserve, remap, reverse, one-to-many split, many-to-one coalesce, partial coverage. |
| Nonphysical | permitted removed terminal vs required missing; intentional zero-length semantic. |
| Ambiguity/conflict | repeated equal directed segment, conflicting lineage, multiple semantic candidates, same-edge `replaces`. |
| Determinism | reverse item/contributor order, canonical ring rotation, repeat/restore. |

### 59. Tests after implementation

Run the full build/test suite plus all authority, composition, mixed metadata, restore, TB/W equivalence, profile offset, tap clearance, reference, orientation, and imported-model diagnostics. Add invariants:

* every required original semantic primitive has a non-empty mapping;
* every final mapping references an existing final segment/node;
* every final segment's reverse origins agree with forward mappings;
* no `references` mapping changes ownership;
* derived tap points/roles and profile mappings agree;
* original generated JSON is byte-identical before/after;
* mapping result is byte-identical under input permutation and snapshot rerun;
* `FinalGeometry` performs no new-schema coordinate guess.

### 60. Exact stop conditions

Stop and do not enable authoritative packaging if any occurs:

* `INVALID_REPLACEMENT_OWNERSHIP` or `CONFLICTING_LINEAGE`;
* `REQUIRED_PHYSICAL_MISSING` (zero candidate for a required primitive);
* `AMBIGUOUS_FINAL_TARGET` (more than one semantically valid resolution);
* `UNSUPPORTED_CONSUMER_MAPPING` for split/coalesce/reverse;
* inconsistent tap/profile/attachment mapping;
* non-deterministic output under input order/ring rotation;
* a final segment reference not present in the authoritative contour;
* any mutation of authored or original generated data;
* legacy snapshot cannot be uniquely migrated;
* baseline physical/manufacturing regression lacks an approved, semantically correct explanation.

Warnings are reserved for explicitly optional display/reference metadata. Never silently drop a required physical segment.

---

## FINAL RECOMMENDATION

### 61. Should contributors directly edit each other's profiles?

No. That violates provenance, creates order dependence, and produces pair-specific rules.

### 62. Should final contour reconciliation be contributor-neutral?

Yes. It operates only on the common lineage/topology contract.

### 63. Should original generated metadata remain immutable?

Yes. It is evidence of contributor intent and is already structurally modeled as readonly/frozen for profiles.

### 64. Should reconciled metadata be derived?

Yes. Store or cache it only with contract/version/hash validation; prefer deterministic recomputation.

### 65. Should current-contour projections be validated against authoritative final contour?

Yes. Every required physical projection must resolve through lineage/topology and reference extant final segments.

### 66. Should split/coalesce be first-class mapping states?

Yes, together with orientation and coverage. One-to-one projection copies cannot express the real topology.

### 67. Can future contributors use the same architecture without downstream changes?

Yes for contributors that implement existing generic ownership, lineage, attachment, projection, and decoration contracts. A new *kind of manufacturing semantic* may require a generic schema extension, but never pair-specific logic.

### 68. Is the architecture ready for implementation?

Yes for the shadow/type/evidence phase. Production authority migration is not ready until the product decisions below are fixed and split/coalesce consumers exist or fail closed.

### 69. Exact recommended implementation boundary

Place `reconcileComposedPanelMetadata` **after successful `composePanel` output and before `packageComposedPanelGeometry` constructs the authoritative `GeneratedGeometryItem`**. The composer emits topology/ancestry evidence; the reconciler derives mappings; packaging serializes; `FinalGeometry` validates/consumes; manufacturing uses final decorations.

### 70. Remaining product decisions

Decide before production enablement:

1. Which current terminal/boundary-run and corner-closure elements are explicitly optional/nonphysical versus mandatory.
2. Whether one coalesced physical segment may carry multiple compatible profile origins and how a user selection combines their offset policy.
3. Whether tap roles may span split children, and whether incompatible coalesced tap roles block.
4. Canonical final segment/node ID and coverage conventions, including ring rotation and reversal.
5. Snapshot strategy: recompute-only versus persisted validated mapping cache, and legacy snapshot support lifetime.
6. Whether a reference target missing after composition blocks its feature or is optional, per relationship role.
7. Whether attachment start/end are preserved as semantic roles under reversal or normalized to final traversal.

None of these decisions should mention TB+W or Wall mouse-hole behavior.

---

Contributors should directly mutate other contributors' generated profiles:  
**NO.**

Post-composition reconciliation should be generic and contributor-neutral:  
**YES.**

The authoritative final contour should determine surviving physical projection mappings:  
**YES.**

Original generated contributor metadata should remain provenance-preserving:  
**YES.**

Reconciled final metadata should be derived:  
**YES.**

Split/coalesced/reversed mappings need explicit semantics:  
**YES.**

Mouse-hole prevention remains an authoring concern:  
**YES.**

Future contributors can participate without pair-specific downstream logic:  
**YES.**

Production code modified in this analysis:  
**NO.**

Ready for implementation design after this report:  
**YES**—begin with the non-authoritative shadow/type/evidence phase and do not enable production packaging until the stated decisions and stop conditions are satisfied.

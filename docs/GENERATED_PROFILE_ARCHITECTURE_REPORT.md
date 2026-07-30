# Generated Profile architecture report

## Scope and executive decision

This report is a code-reading analysis. It does not prescribe a change to current production behavior and does not modify Geometry Services, FinalGeometry, ManufacturingGeometry, either generator, compensation, serialization, UI, or tests.

The central finding is that a **Generated Profile is the ordered replacement authored by one generator operation for one directed source edge of one panel**. It begins at a generator-authored attachment, contains the leading run, ordered generated taps and intervening runs, ends with the trailing run at the other attachment, and retains references to the generated elements that realize that replacement. It is not:

* every geometrically modified segment in a final contour;
* a set of segments recovered by comparing a generated path with an imported path;
* a `GeneratedProfileId` attached independently to matching contour segments; or
* a synonym for a tap, a connection, a whole generated panel path, or a compensation mask.

The best long-term authority is therefore **generator-authored profile structure (option C)**. `GeneratedProfileGroup` and `GeneratedTapGroup` contain much of the necessary data, but the existing structures are not sufficient as an authoritative model: they are parallel arrays without explicit membership, element order, direction, terminal semantics, or durable segment references. They are sufficient to bootstrap a migration without inventing profile intent after generation.

Profile Offset and Tap Clearance should consume the same profile representation. Profile Offset selects and displaces the profile's projected geometry; Tap Clearance selects particular walls from the profile's ordered taps. Geometry Services should remain the geometry executor, while the profile is the source of the selection mask and its terminal constraints.

## 1. What the generators know

### 1.1 Meaning of “the exact moment”

There are two useful instants:

1. **Planning:** a panel-side operation and its ordered segment plan exist before contour emission.
2. **Tap emission:** the generator has calculated the four points of one tap and is about to append them to the panel contour.

Some facts are known by the active generator but never copied into a persistent record. The distinction between “known” and “stored” is the first information-loss boundary.

### 1.2 TB generator

Before a TB tap is emitted, the implementation has all of the following:

| Knowledge | Exact form at generation time | Persisted today? |
|---|---|---|
| Generator/tool | TB call path | Yes, on the generated item and in IDs. |
| Panel | The complete `SvgPanel`, its contour, edge IDs, bounds, and winding | Panel ID only in the tap/profile; panel source data remains elsewhere. |
| Connection and operation | `PanelTabOperation`, connection ID, source edge ID, role, material/inset depth, and finger width/segment plan | Operation/connection/edge identity partially; resolved operation detail is not owned by the profile. |
| Directed source side | Source side index; canonical source edge; whether contour order is reversed; inset `side.start -> side.end` | No explicit profile direction. It is later inferred from contour and source-edge order. |
| Profile extent | The two inset-contour points at the source edge indices | Yes, as optional `attachmentStart`/`attachmentEnd`. |
| Ordered tap plan | `operation.segments`, normalized by role, mirrored when canonical direction and contour direction differ, then clipped to the inset side | Only incidentally through callback/array order and the index embedded in an opaque ID. |
| Tap count | `segments.length` | No explicit count. |
| First/middle/last | The `segments.forEach` index and array length | Index is supplied to ID construction; position semantics and count are not stored. |
| Tap geometry | `baseStart`, `tabStart`, `tabEnd`, `baseEnd` | Yes, as a four-point tuple. |
| Tap elements | Directed left/start wall, tip, and right/end wall | Yes as coordinates plus three local roles, not as stable element identities. |
| Leading straight section | From the inset-side start/attachment to the first `baseStart`, when distinct | Present in the contour being assembled, but not recorded as a profile element. |
| Inter-tap straight sections | From one tap's `baseEnd` to the next tap's `baseStart` | Present in contour order, but not recorded as profile elements. |
| Trailing straight section | From the last `baseEnd` to inset-side end/attachment, when distinct | Present in contour order, but not recorded as a profile element. |
| Neighboring generated elements | Previous contour point, next planned tap/run, adjacent side operations, and special adjacent BB corner construction | Known while building the contour; no explicit neighbor relation survives. |
| Attachment relationship | The profile joins the preceding and following panel-side output; an adjacent operated edge can own the profile on the other side of the same corner | Coordinates survive, relationship/ownership does not. |
| Imported-boundary coincidence | Whether either tap wall lies on any original panel boundary | Persisted as `source-boundary-*` versus `tap-side-*`; this is a geometric observation, not terminal ownership. |
| Complete generated panel contour | The ordered accumulated `tabbedContour`, later cleaned and serialized to `pathD` | Persisted only as the whole path, not as an element graph. |

TB first builds all applicable edge operations for a panel, builds the inset contour, and then emits a single generated panel item containing all those edge operations. Thus a one-edge, two-adjacent-edge, or four-edge panel is already distinguishable during generation even though each becomes one panel path.

### 1.3 S generator

For the male S-A panel boundary, S knows the same profile facts as TB:

* the S-A panel and source edge, its contour side and winding;
* the connection and S-A/S-B edge pairing;
* wall thickness, insert depth, resolved slot length, and ordered A-segment plan;
* canonical-versus-contour reversal and the normalized/clipped sequence;
* each tap's index, four points, two walls, and tip;
* the profile attachments from the S inset-boundary result;
* leading, inter-tap, and trailing straight runs while assembling the contour; and
* adjacent operated and unoperated panel sides.

S additionally knows the receiving S-B panel, inward normal, slot offset, and the corresponding slot items. These are operation knowledge and cross-panel correspondence, not necessarily ownership fields of the male GeneratedProfile. A profile may keep stable references to the operation and counterpart elements rather than copying their geometry.

S groups male operations by panel and emits one panel replacement after processing all of that panel's S-A operations. The item-level owner is then chosen by lexical connection order. Individual profile groups and taps retain their per-connection operation IDs, but the containing item's `operationId`, `source.connectionIds`, and connection-edge references describe only the chosen owner. This is a concrete case where the whole-item envelope is less truthful than the generator's per-profile knowledge.

### 1.4 What both generators already know, but the current model does not say

Both generators can answer, without examining the final contour:

* which directed profile a tap belongs to;
* its ordinal and the total number of taps in that profile;
* which wall faces the profile-start attachment and which faces the profile-end attachment;
* whether it is first, middle, last, or the only tap;
* what straight generated section precedes and follows it;
* where the complete replacement attaches; and
* which adjacent source-side operation meets each attachment.

The current callback captures the tap tuple and index but not the total, explicit profile ID, direction, neighboring elements, or terminal classification. The contour builder knows the missing facts transiently. They disappear at record construction, before any contour merge.

## 2. Current architecture and complete information trace

```text
generator plans and emits ordered panel-side structure
  -> GeneratedGeometryItem { pathD, profileGroups[], generatedTaps[] }
  -> GeneratedGeometrySnapshot (structured clone)
  -> FinalGeometry parses pathD and geometrically projects IDs/roles to segments
  -> ManufacturingGeometry clones only final-contour projections
  -> Profile Offset turns selected profile IDs into a boolean contour mask
  -> Tap Clearance replaces that mask with a role-derived boolean contour mask
  -> selective reconstruction executes the mask
```

### 2.1 Generator

**Still exists:** all planning and emission knowledge listed above; whole panel output; per-profile group identity/source/optional attachments; per-tap identity/source/points/local roles.

**Already discarded when records are created:** explicit profile-to-tap membership; tap count/position; profile direction; leading/trailing/inter-tap elements; stable identities for walls, tips, runs, and joins; neighbor links; shared attachment relationships.

**Reconstructed/inferred:** `source-boundary-*` is inferred from coordinate coincidence with any imported panel boundary. It does not derive from first/last position.

**Must not be discarded:** directed ordering, membership, attachments, terminal identity, and stable references from authored elements to emitted geometry.

### 2.2 `GeneratedGeometrySnapshot`

**Still exists:** `GeneratedGeometryItem` is structured-cloned, so `profileGroups`, `generatedTaps`, array order, point tuples, roles, and attachments survive. Operations also survive in a separate snapshot array.

**Discarded:** nothing further in the native path. However, legacy snapshot adapters can create profile groups from edge IDs without attachments or tap groups. The schema permits optional structure, so consumers cannot assume generator-grade completeness.

**Reconstructed/inferred:** compatibility creation infers profiles from path edge IDs and operation lookup. That yields identity, not authored element structure.

**Must not be discarded:** this should be the durable handoff for complete profiles; compatibility records should be explicitly versioned/incomplete rather than indistinguishable from native records.

### 2.3 `FinalGeometry`

**Still exists on entry:** path, source panel, profiles, taps, and imported contour.

**Still exists on output:** final points/path; one scalar `segmentProfileIds` entry, `segmentTapIds` entry, and `segmentTapRoles` entry per contour segment; an automatic compensation mask; material-side metadata.

**Discarded:** the profile and tap objects themselves, tap/profile order, attachments, direction, counts, element adjacency, operation/connection identity, and the distinction between authoritative structure and projection. The output cannot navigate from a tap to its profile.

**Reconstructed:**

* the final contour is reparsed from `pathD`;
* tap provenance is recovered by directed coordinate equality against tap tuples;
* profile membership is recovered by locating attachment coordinates and walking the final contour, with fallbacks based on imported-edge coincidence; and
* the resulting profile IDs are intersected with an automatic geometric mask based on differences/coincidence between imported and generated contours.

**Inferred:** profile extent when attachments are absent; “modified profile” from geometric difference; one winning provenance value where more than one claim matches.

**Additional ownership loss:** panel replacements are stored in a map keyed only by panel ID, so multiple separate replacement items are last-writer-wins. Current native builders usually consolidate a panel, but the merge contract does not protect or compose multiple authors.

**Must not be discarded:** complete profile objects and a validated projection/remap from authored elements to final segments. FinalGeometry may simplify or merge geometry, but it should not be asked to rediscover manufacturing intent.

### 2.4 `ManufacturingGeometry`

**Still exists:** a mutable clone of final contour points, paths, boolean masks, scalar per-segment IDs/roles, and diagnostics.

**Discarded:** nothing new relative to FinalGeometry, but it confirms the prior loss by cloning no profile/tap structure. Subsequent geometry replacement can change points while semantic data remains index-based.

**Reconstructed/inferred:** none during cloning. Profile selection later searches scalar segment IDs to discover where a selected profile exists.

**Must not be discarded:** the immutable authored profile graph and a stage-specific projection. Manufacturing should mutate working geometry, not the intent records.

### 2.5 Profile Offset

**Still exists:** selected `GeneratedProfileId` values from settings and scalar segment membership on final contours.

**Discarded for the operation:** profile direction, attachments, elements, and operation are unavailable; only a boolean segment mask is passed to Geometry Services.

**Reconstructed:** selected IDs are scanned across contours, converted into `compensationProfile`, contiguous selected runs are found, their offset sides are constructed, and transition vertices are rebuilt from intersections or transition joins.

**Inferred:** the complete profile geometry has already been inferred in FinalGeometry by the automatic mask plus attachment walk. Offset then infers topology again from the boolean run.

**Must not be discarded:** authored start/end and ordered element membership. These define selection and transitions directly. Reconstruction should rebuild only the displaced geometry, not the meaning or extent of a profile.

### 2.6 Tap Clearance

**Still exists:** final-segment tap ID and local role.

**Discarded for the operation:** profile membership, tap order/count, first/last status, and inner/outer wall semantics.

**Reconstructed/inferred:** eligibility is inferred as “tap ID is non-null and role is `tap-side-start` or `tap-side-end`.” The selected segments then use the same geometric reconstruction machinery as Profile Offset. The ID proves a segment was matched to some tap, but its encoded index is not used.

**Must not be discarded:** ordered profile membership and explicit wall references. Tap Clearance is a rule over a tap's position in its profile, not a rule over imported-boundary coincidence.

## 3. Competing sources of truth

| Candidate truth | What it actually means | Failure when treated as authority | Long-term status |
|---|---|---|---|
| `GeneratedProfileId` | Stable identity derived from tool, connection, panel, and source edge | Identity alone says neither extent nor order | Retain as opaque identity. |
| `GeneratedTapId` | Stable tap identity whose construction currently includes an index | Consumers would have to parse an opaque string; no explicit profile link/count | Retain as opaque identity; store relationships as fields. |
| `profileGroups[]` | Source identity and optional attachments | It contains no ordered elements or taps | Evolve/replace with the full profile record. |
| `generatedTaps[]` | Generator-authored tap tuples appended in generation order | Array order is global to a panel item and membership is an implicit multi-field join | Evolve/replace with explicit membership and ordinal. |
| `segmentProfileIds` | A lossy final-contour projection after attachment walking and automatic-mask intersection | It can omit valid authored sections and cannot preserve multiple claims | Keep temporarily as a cache/projection, never as authority. |
| `segmentTapIds` | Coordinate-matched final-contour projection | Scalar ownership and matching ambiguity lose intent | Keep temporarily as a cache/projection. |
| segment tap roles | Local tuple role plus imported-boundary coincidence | Does not encode first/last or inner/outer; causes opposite regressions | Demote to diagnostics or remove after reconstruction no longer needs it. |
| source-boundary roles | “This emitted wall coincides with any imported boundary” | Confused with “outer terminal of this profile” | Remove as a manufacturing eligibility concept. |
| corner role/closure | Reconstruction anchor hint | A vertex/join fact is not profile/tap ownership | Keep only if the geometry algorithm demonstrably requires it; otherwise remove. |
| automatic geometric profile mask | Difference/support relationship between generated and imported contours | Redefines authored profile scope heuristically | Retain only for legacy/incomplete data or unrelated diagnostics. |
| imported-boundary coincidence | Geometric relationship to the original panel | Adjacent generated edges move joins; one-tap profiles can exclude both walls | Never manufacturing intent authority. |
| final-contour position/bounds | Emergent result | Axis, winding, topology, and previous compensation alter it | Never profile/tap authority. |

There must be one semantic truth: the immutable generator-authored graph. Segment arrays and masks are projections of it for a particular contour revision and must be invalidated/remapped when geometry changes.

## 4. The first-class object

### 4.1 Recommended conceptual contract

This is a conceptual schema, not proposed production code:

```text
GeneratedProfile
  identity: profile ID, generator kind, operation reference
  ownership: panel ID, directed source-edge reference
  boundary: start attachment, end attachment
  structure: ordered generated element references
  taps: ordered GeneratedTap references

GeneratedTap
  identity: tap ID, profile ID, explicit ordinal
  elements: start/left wall, tip, end/right wall references

GeneratedElement
  identity: stable element ID
  kind: leading-run | tap-wall | tap-tip | inter-tap-run |
        trailing-run | join/closure (if geometrically emitted)
  directed geometry reference
```

The profile should own or reference:

* **operation:** yes, by immutable reference/ID; operation parameters need not be duplicated;
* **panel:** yes, as the panel whose boundary it replaces;
* **source edge:** yes, as a directed source reference;
* **direction:** yes, explicitly, because “first” and “last” must not depend on screen axes or winding inference;
* **ordered generated elements:** yes; otherwise Profile Offset must rediscover the complete run;
* **ordered taps:** yes, preferably as references into the element sequence;
* **attachment points:** yes, both required for native generated data;
* **profile start/end:** yes semantically; normally these are the directed attachments, so separate coordinates would be redundant. Store one pair with explicit start/end meaning rather than two competing pairs.

The object is the primary **manufacturing-intent object**, not a replacement for a closed final panel contour. FinalGeometry remains authoritative for the shape to render/export at its stage. The distinction is intentional: profile structure answers *what is this generated feature?* while the final contour answers *what is the current boundary geometry?*

### 4.2 Are existing structures enough?

**For recovery/migration: mostly yes. For the final contract: no.** Native generator output already has IDs, operation/panel/source-edge keys, attachments, tap tuples, and incidental order. The generator's local variables supply direction, count, and straight runs. Therefore no contour heuristic is needed to create the richer record.

The persisted structures cannot safely answer membership when records from multiple operations share an item; cannot state first/last without filtering and trusting incidental order; cannot enumerate the full Profile Offset extent; and cannot remap elements after cleanup using durable references. Those are structural omissions, not merely missing convenience fields.

## 5. Ownership rules

Ownership should distinguish elements, vertices, geometry projections, and references.

### One generated edge

The panel has one GeneratedProfile. It exclusively owns the semantic replacement of that source edge. Its two attachment vertices are also part of the closed panel contour and meet neighboring ungenerated sides. The neighboring panel boundary does not thereby become part of the profile.

### Two adjacent generated edges

The panel has two GeneratedProfiles. Each owns its own ordered source-edge replacement. The common corner/attachment can be referenced by both profiles: it is the end attachment of one and start attachment of the next according to contour direction. Shared reference is not double ownership of a segment.

A corner is a zero-dimensional join and **can belong to/be referenced by two profiles**. Modeling it as a scalar “owner” forces one valid claim to overwrite the other. Prefer a stable `Attachment`/vertex reference with incident profile endpoint references, or allow both profiles to carry the same point/vertex ID plus endpoint role.

### Four generated edges

The panel has four GeneratedProfiles forming a cyclic chain around one final panel contour. Every panel corner joins two profiles. There is still no “whole panel is one profile”: each operation/source-edge retains independent direction, terminals, taps, selection, and manufacturing policy.

### Can one panel contain multiple profiles?

Yes. This is already the generator reality: both TB and S group several operations into one panel item while creating a profile group for every operated source edge. Panel replacement and profile ownership are different cardinalities: generally one replacement contour per panel, zero-to-many profiles per panel.

### Can one segment belong to two profiles?

Normally, no. A non-zero directed boundary element should have one semantic authoring profile. Two adjacent profiles share an endpoint, not a run. If cleanup/merging makes two authored element references coincide with one final segment, the final-segment **projection must be multi-valued or report an ambiguity**; it must not silently establish shared semantic ownership or pick the later record. The authored elements remain separately owned even if a downstream geometric representation coalesces them.

Recommended cardinalities are therefore:

```text
Panel 1 ---- 0..* GeneratedProfile
GeneratedProfile 1 ---- 1..* GeneratedElement
GeneratedProfile 1 ---- 0..* GeneratedTap
GeneratedTap 1 ---- exactly 3 tap elements
Attachment 1 ---- 1..2 incident profile endpoints on a simple panel
FinalSegment * ---- 0..* authored element projections
```

## 6. Profile Offset decision

### A. Final contour segments — reject as authority

They are necessary input to the geometry executor, but do not carry authored extent, direction, joins, or robust ownership. Starting here forces attachment walking, imported-contour comparison, run discovery, and ambiguity handling to reconstruct something already known.

### B. Generated profiles — correct only if “profile” means the full first-class object

The current `GeneratedProfileGroup` is too thin. A full profile can author the intended selection, but still requires a projection onto the current contour before displacement.

### C. Generator-authored profile structure — recommended

Profile Offset fundamentally operates on C. The selected profile provides ordered element membership and terminal transitions. A versioned projection maps those elements to Final/Manufacturing contour segments. Geometry Services then offsets/reconstructs the mapped current geometry. This preserves a clean boundary:

* generator/profile: semantic scope and order;
* projection/remap: provenance through contour transformations;
* Geometry Services: numerical offset and reconstruction.

The current reconstruction does rebuild what the generator knew: the contiguous replacement run, its entry/exit, its adjacency to unchanged geometry, and transition points. Numerical intersections/joins must of course be calculated after displacement, but the *identity and ordering of the sides being joined* should not be reconstructed from a boolean mask.

The documented parallel-transition failure is related but not identical. Its immediate numerical cause was treating an expected selected/unselected parallel transition as fatal. Architecturally, the system reached that ambiguity through a mask lacking authored transition semantics. A full profile would not eliminate all geometric reconstruction, but it would supply the original transition/attachment structure and make failures local and diagnosable rather than rediscovering profile boundaries.

## 7. Tap Clearance decision and first/last model

### A. Segment roles — reject

Roles label an isolated directed tuple and overload imported coincidence as a terminal rule. They cannot distinguish a middle wall from the inner or outer wall of a terminal tap without profile position.

### B. `GeneratedTapId` — insufficient alone

It establishes identity. Although the current ID construction includes `tapIndex`, opaque IDs should not be parsed for domain behavior, and the ID contains neither count nor explicit profile relation/wall semantics.

### C. Ordered GeneratedProfile structure — recommended

Both generators already normalize the segment sequence for canonical reversal, iterate it in emitted contour order, know the index and array length, and calculate both walls. The clean rule is therefore:

| Position in one directed profile | Start/left wall | Tip | End/right wall |
|---|---|---|---|
| First of multiple | Outer: fixed | Fixed | Inner: eligible |
| Middle | Eligible | Fixed | Eligible |
| Last of multiple | Inner: eligible | Fixed | Outer: fixed |
| Only tap | Both are simultaneously terminal/outer under the stated rule; both fixed | Fixed | Both fixed |

“Left/right” above means tuple/profile order, not screen direction. If product intent requires clearance on a one-tap profile, it must explicitly define a different rule; geometry coincidence must not silently decide it.

The information disappears in two steps. At generator record construction, index/count/membership are not made explicit. At FinalGeometry, even the remaining tap objects and array order are flattened into scalar coordinate-matched segment arrays. Manufacturing then ignores the ID's identity beyond a non-null check and uses only the role predicate.

## 8. Why top, bottom, side, and center panels differ

No panel position or color has a legitimate semantic role in compensation. Differences arise from operation role and topology:

* A top or bottom panel with one operated edge often joins two unchanged imported edges. Imported-boundary coincidence accidentally agrees with profile-terminal ownership, so it appears correct.
* A side panel can have a short or one-tap profile whose two walls both coincide with adjacent imported boundaries. Both become `source-boundary-*`, leaving no eligible wall even if a desired product rule expected movement.
* A center panel often has adjacent generated edges. Their common corner is generated/generated rather than generated/imported; a terminal wall may not coincide with the imported boundary and remains eligible, so an outer terminal moves.
* S-A versus S-B operation role produces a male generated panel profile versus female slot paths; those intentionally have different manufacturing classifications and policies. This is a valid role difference, not a positional one.

Cause assessment:

| Candidate | Contribution |
|---|---|
| Ownership | **Primary.** Multiple profiles are collapsed into a panel item and scalar segment claims; shared attachments are not modeled. |
| Reconstruction | **Primary downstream amplifier.** Profile scope and tap mapping are rebuilt from final coordinates/masks. |
| Profile merging | **Material.** One panel path contains multiple profiles; FinalGeometry also has last-writer-wins replacement behavior if separate items exist. |
| Metadata overwrite | **Material for S and merge edge cases.** S chooses one lexical item-level owner; scalar segment matching can overwrite a prior match. Per-profile records remain more accurate until flattening. |
| Heuristic boundary detection | **Immediate cause of opposite Tap Clearance outcomes and part of Profile Offset scope inference.** Imported coincidence is not terminal ownership. |

Thus different panels do not prove different manufacturing rules. They expose different places where geometric topology happens, or fails, to match missing profile semantics.

## 9. Current versus proposed architecture

| Concern | Current implementation | Proposed architecture |
|---|---|---|
| Profile definition | ID/source record plus final geometric reconstruction | One operation's ordered replacement of one directed panel source edge |
| Panel relationship | One generated path item usually replaces a panel | One panel replacement contains/references many independent profiles |
| Tap relationship | Parallel array joined implicitly by operation/panel/edge | Explicit `profileId`, ordinal, and ordered membership |
| Straight runs | Implicit in `pathD`/contour gaps | First-class generated elements or durable element references |
| Terminals | Optional attachment coordinates plus coincidence roles | Required directed start/end attachments and endpoint semantics |
| Corner ownership | Scalar segment metadata / geometric coincidence | Shared attachment reference with two incident profile endpoints |
| FinalGeometry | Discovers profile/tap projections by coordinate and imported geometry | Validates/remaps generator-authored element provenance; never invents intent |
| ManufacturingGeometry | Clones masks and scalar arrays | Carries immutable intent plus a mutable, revisioned projection |
| Profile Offset selection | Profile ID -> reconstructed scalar mask | Profile -> ordered elements -> validated projection -> geometry operation |
| Tap Clearance selection | tap ID non-null + local role predicate | tap position -> explicit eligible wall refs -> validated projection |
| Ambiguity | Later assignment can win; missing matches become null | Multi-valued projection or explicit diagnostic; never silent overwrite |
| Legacy input | Structurally indistinguishable optional metadata | Explicit incomplete/legacy provenance with isolated fallback |

## 10. Single sources of truth

* **GeneratedProfile:** the native generator record emitted at the moment the directed source-edge replacement is built.
* **GeneratedTap:** the tap record owned by that GeneratedProfile, with explicit ordinal and element references.
* **Profile Offset:** the selected GeneratedProfile's ordered element set and attachments, projected onto the current manufacturing contour; never the automatic geometric mask.
* **Tap Clearance:** eligibility derived from ordered GeneratedTap position within its GeneratedProfile, projected onto current wall segments; never roles or imported coincidence.
* **Current geometry:** FinalGeometry/ManufacturingGeometry remain the source for coordinates at their respective stages, but not for generated-feature semantics.

This separation avoids another competing truth: semantic authority belongs to the profile graph, while numerical geometry belongs to the current contour. The mapping between them is explicit and revisioned.

## 11. Minimal-change migration strategy

The fewest safe future changes come from evolving the data handoff before changing compensation behavior:

1. **Document and validate the invariant.** Treat one `(tool, operation, panel, directed source edge)` as one profile. Specify the single-tap decision explicitly. Preserve current output.
2. **Enrich generator records at the existing callbacks.** Use data already in local scope to add explicit profile membership, ordinal/count, direction, required attachments, and ordered element references. Avoid a second generator pass.
3. **Unify the two parallel arrays.** Keep existing IDs for compatibility, but make profiles own ordered tap references/elements. Snapshot clone semantics already transport nested records; bump/version the native schema and flag compatibility-created profiles as incomplete.
4. **Add a provenance projection layer at FinalGeometry.** Map stable authored elements to final segments while parsing/merging. Preserve multiple claims or fail diagnostically. Initially also emit the existing scalar arrays and masks so behavior remains unchanged.
5. **Carry intent plus projection into ManufacturingGeometry.** Keep immutable authored records separate from mutable coordinates. Recompute/invalidate only the projection after a geometry-changing stage.
6. **Shadow Profile Offset selection.** Compare profile-element projection with today's `segmentProfileIds`/automatic mask, including one, adjacent two, and four operated edges. Do not cut over until differences are classified.
7. **Cut Profile Offset over to the shared representation.** Geometry Services continues to execute offsets; only semantic selection and transition input change.
8. **Shadow and then cut over Tap Clearance.** Derive wall eligibility from ordinal/count and explicit wall refs. This reuses the same projection and adds no new role vocabulary.
9. **Remove/demote duplicate truths.** Once legacy support is bounded, delete automatic profile discovery as native authority, remove role-based eligibility, stop parsing semantics from IDs, and remove scalar segment arrays where no compatibility/rendering consumer remains.

This ordering minimizes changes because it reuses current IDs, snapshot nesting, generator callbacks, final contour representation, and Geometry Services. It changes the ownership model once and lets both compensation features converge on it rather than applying separate corrective heuristics.

## 12. Concepts to retain, demote, or remove

### Retain

* `GeneratedProfileId` and `GeneratedTapId` as opaque stable identities.
* operation, connection, panel, and directed source-edge references.
* generator-authored tap tuples during migration, preferably upgraded to stable element references.
* required profile attachments.
* FinalGeometry and ManufacturingGeometry as coordinate-stage models.
* Geometry Services as the numerical executor.

### Demote to projections or compatibility

* `segmentProfileIds` and `segmentTapIds`;
* `compensationProfile` boolean masks;
* attachment/coordinate matching; and
* automatic imported-versus-generated profile classification.

These may remain useful caches or legacy bridges, but must be derived, revision-bound, and non-authoritative.

### Remove entirely as manufacturing truths

* imported-boundary coincidence as the definition of a profile terminal;
* `source-boundary-*` as a Tap Clearance eligibility rule;
* segment roles as the primary Tap Clearance model;
* final corner/bounds heuristics for first/last behavior;
* semantic parsing of the index embedded in `GeneratedTapId`; and
* last-writer-wins scalar ownership where ambiguity is possible.

`corner-closure` and source-boundary hints should survive only if isolated Geometry Services reconstruction tests prove they remain necessary as numerical anchor hints after explicit attachments/elements exist. If so, rename them as reconstruction hints so they cannot again compete with semantic ownership.

## Final recommendation

Make GeneratedProfile the shared, immutable manufacturing-intent object authored by TB and S before contour merge. It should own a directed source-edge replacement, ordered elements, ordered taps, and start/end attachments, and should reference its operation and panel. Each GeneratedTap should own explicit wall/tip element references and an ordinal within that profile.

Do not make the GeneratedProfile a second geometric contour. Project its stable element references onto the current Final/Manufacturing contour, retain ambiguity explicitly, and let Geometry Services operate on that projection. Profile Offset selects the profile's ordered elements; Tap Clearance selects eligible walls by first/middle/last position in the same object.

The architecture problem is not that the generators lack the required knowledge. They already have it. The problem is that the model records fragments, discards their relationships, and later reconstructs structural intent from coincident geometry. Preserving the original relationships is the cleanest long-term design and the only single source of truth that explains one-edge, adjacent-edge, and all-edge panels without panel-position-specific exceptions.

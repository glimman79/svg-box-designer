# Wall v2 Step A2: minimal corner-authoring contract

## Status and evidence boundary

This is an architecture/evidence contract, not production Wall code. It
corrects Step A's overly broad statement that two adjacent Wall-operated edges
must have an ordered A/B orientation. Two adjacent Wall edges are not by
themselves restricted. Same-role `WA/WA` and `WB/WB` corners are allowed. Of
the two mixed orders, exactly one product-designated canonical order is allowed
and its reverse is forbidden because it creates the physical open corner.

The repository still cannot map the labelled light-blue assembly to either
canonical `incoming WA, outgoing WB` or canonical `incoming WB, outgoing WA`.
Native TB proves both alternatives are closed 2-D contours, not which assembly
is physically correct. **PRODUCT INPUT REQUIRED:**

```ts
allowedMixedCornerOrientation:
  | ['WA', 'WB'] // canonical incoming, canonical outgoing
  | ['WB', 'WA'];
```

Tests run once for each possible designation. Supplying that one value selects
the product behavior without redesign. Production Wall work remains blocked
until it is supplied; this architecture step is not blocked.

## Local truth table

`no` means that incident source edge has no Wall assignment. “Unconstrained”
means Wall adds no restriction at that corner. `MIXED_ALLOWED` and
`MIXED_FORBIDDEN` are placeholders until the product value is designated.

| canonical incoming | canonical outgoing | result |
|---|---|---|
| no | no | unconstrained |
| WA | no | unconstrained; WA is allowed |
| WB | no | unconstrained; WB is allowed |
| no | WA | unconstrained; WA is allowed |
| no | WB | unconstrained; WB is allowed |
| WA | WA | allowed |
| WB | WB | allowed |
| WA | WB | `MIXED_ALLOWED` or `MIXED_FORBIDDEN` (product input) |
| WB | WA | the opposite result from WA/WB |

There is no panel-wide pattern. The rule does not require alternating roles,
all-one-role panels, one Wall per panel/corner, or shared connection identity.
It permits many Wall connections, different connection IDs on adjacent edges,
and all four panel edges being Wall-operated, subject only to evaluating each
mixed corner locally.

## One semantic service, two consumers

The future Wall-owned domain service should expose contracts equivalent to:

```ts
type WallRole = 'WA' | 'WB';

allowedWallRolesForEdge(
  sourceEdge: CanonicalSourceEdge,
  authoredWallAssignments: ReadonlyMap<SourceEdgeKey, WallAssignment>,
  topology: NormalizedPanelTopology,
  allowedMixedCornerOrientation: readonly [WallRole, WallRole],
): ReadonlySet<WallRole>;

validateWallAuthoredState(
  authoredWallAssignments: ReadonlyMap<SourceEdgeKey, WallAssignment>,
  topology: NormalizedPanelTopology,
  allowedMixedCornerOrientation: readonly [WallRole, WallRole],
): readonly WallCornerViolation[];
```

The role query tentatively evaluates each of `WA` and `WB` at both canonical
endpoints, retains a role only if every incident corner accepts it, and returns
`{WA,WB}`, `{WA}`, `{WB}`, or `{}`. Endpoint constraints are intersected, so no
constraint yields both roles, one constraint yields one role, two agreeing
constraints yield that one role, and opposing constraints yield none. Empty
means assignment must wait for the user to change surrounding roles. It never
mutates another assignment, swaps roles, uses tool priority, or repairs output.

Defensive validation enumerates normalized corners and applies the exact same
corner predicate before generation/Apply. Imported or programmatic malformed
state therefore cannot bypass proactive UI behavior. Query and validator call
one predicate; they are not independent interpretations.

## Canonical topology and independence

Normalize every validated simple closed outer contour to a chosen canonical
winding. At each vertex, incoming terminates there and outgoing begins there.
Resolve assignments by canonical source-edge identity, then evaluate roles;
raw record direction, raw array index, lexical edge/connection IDs, and
assignment/connection insertion order are not semantic inputs. This makes the
rule invariant under CW/CCW input, reversed raw edge records, arbitrary IDs,
90-degree and 27-degree rotation, translation, and any rigid rotation.

Connection membership is deliberately absent from the predicate. Adjacent
edges may belong to the same or different W connections. The diagnostic
parameterizes the truth table and allowed-role query over either possible
physical mixed orientation.

## Unchanged generic and downstream contracts

Wall remains contributor `W`; a complete connection can use `W<n>-A`,
`W<n>-B`, and `operation:W:<connectionId>`. Both roles contribute `REPLACES`.
Generic ownership remains one `REPLACES` owner and zero-or-many `REFERENCES`
claims per source edge. Thus TB+W replacement and W+W replacement conflicts
fail closed, while W replacement plus S-B reference or any future
reference-only contributor is valid. No future contributor pair is hardcoded.

No changes are required in generic relationship indexing, `panelComposer`,
authority/defaults, FinalGeometry, manufacturing, snapshot/history semantics,
or TB/S geometry. Wall-specific orientation knowledge belongs only in the
future Wall corner-rule service. No generator, production authoring, or UI
change is part of Step A2.

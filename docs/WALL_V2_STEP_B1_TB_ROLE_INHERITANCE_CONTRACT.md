# Wall v2 Step B1: TB panel-pair orientation inheritance contract

## Status and product rule

This is a product/domain contract and focused diagnostic, not production Wall
code. A complete Wall connection joins two distinct panels and contains exactly
one `W-A` and one `W-B`. Wall inherits the A/B orientation of complete TB
connections **between those same two panels**. It does not inherit a label from
the exact Wall source edge, spatial position, raw edge direction, screen
position, or top/bottom naming.

For candidate panels P and Q, a complete TB connection is usable evidence only
when its authored assignments unambiguously place exactly one TB-A and exactly
one TB-B on P and Q, one role per panel. Evidence on different source-edge
locations still counts. A complete P=A/Q=B connection votes `P_A_Q_B`; a
complete P=B/Q=A connection votes `P_B_Q_A`.

The resolver considers every complete TB connection whose two panels are
exactly P and Q:

| Complete P/Q TB evidence | Result |
|---|---|
| none | `NO_TB_ORIENTATION` |
| one or more, all P=A/Q=B | `P_A_Q_B` |
| one or more, all P=B/Q=A | `P_B_Q_A` |
| both orientations | `AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION` |

Order and identity never break a tie: connection insertion order, assignment
insertion order, connection IDs, source-edge IDs/directions, CW/CCW winding,
rotation, and translation are not semantic inputs. TB connections between P
and another panel, or Q and another panel, are unrelated and ignored.

## Incomplete and malformed authored data

An incomplete TB draft (including an A-only or B-only connection) is not an
orientation oracle and is ignored. Missing mates are never invented. A record
claiming both roles but failing to identify unambiguous one-A/one-B membership
on exactly two distinct panels is malformed complete evidence and fails closed
with `AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION` when it involves both candidate
panels. This distinction lets normal drafts remain non-blocking while corrupt
complete state cannot enable an unsafe Wall choice.

## Proposed typed resolver and availability API

The future pure domain API should be equivalent to:

```ts
type TBRole = 'A' | 'B';
type TBPanelAssignment = Readonly<{
  connectionId: ConnectionId;
  panelId: PanelId;
  sourceEdgeId: SourceEdgeId;
  role: TBRole;
}>;

type TBPanelPairOrientation =
  | { kind: 'NO_TB_ORIENTATION' }
  | { kind: 'P_A_Q_B' }
  | { kind: 'P_B_Q_A' }
  | { kind: 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION' };

resolveTBPanelPairOrientation(
  panelP: PanelId,
  panelQ: PanelId,
  tbConnections: readonly TBConnection[],
  assignments: readonly TBPanelAssignment[],
): TBPanelPairOrientation;

availableWallOrientationsForPanelPair(...): ReadonlySet<
  'P_WA_Q_WB' | 'P_WB_Q_WA'
>;
```

The availability mapping is deterministic: none maps to both choices,
`P_A_Q_B` maps only to `P_WA_Q_WB`, `P_B_Q_A` maps only to `P_WB_Q_WA`, and
ambiguity maps to the empty set. With no TB, the user freely chooses the first
role and the mate becomes complementary. With consistent TB, the UI should
offer only its orientation. With ambiguity, authoring and defensive
pre-generation validation fail closed using this same service; neither may
silently swap Wall or modify TB.

Edge-local `TB-A + TB-A` and `TB-B + TB-B` candidate labels are not Wall
pairing conflicts. They matter only as assignments belonging to actual complete
TB connections between the candidate panel pair. The old same-edge inheritance
and mixed-corner orientation rules are superseded.

## Cardinality, ownership, and unchanged architecture

Every complete Wall connection still requires one `W-A` and one `W-B`.
Both `W-A` and `W-B` are `REPLACES`. Generic one-`REPLACES`-owner/many-
`REFERENCES` ownership therefore already gives the intended outcomes: W plus
S-B reference is valid; W plus TB replacement conflicts; W1 plus W2 replacement
conflicts. No W-specific generic authority, `panelComposer`, `FinalGeometry`,
manufacturing, or PM thickness change is required. Wall will consume the
existing canonical PM thickness contract when production work begins.

The intended future toolbar order remains `Select, TB, W, S, J, P, MFG`. TB is
encouraged before W but is not mandatory.

## Deferred TB-domain validation

A future TB-domain rule may limit a panel pair to top and bottom connections
and require those complete TB connections to express the same orientation.
Step B1 does **not** implement either a maximum-two rule or that consistency
validation. Wall merely handles current evidence defensively: consistent
multiple TB connections constrain Wall; contradictory ones fail closed.

No production Wall generator, finger-joint kernel extraction, W toolbar,
persistence, App workflow, or downstream pipeline modification is included.

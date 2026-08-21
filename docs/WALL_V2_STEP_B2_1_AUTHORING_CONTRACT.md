# Wall v2 Step B2.1: authoring and TB-meeting normalization

## Relevant-meeting identity

The former rule treated every complete TB connection between the two Wall panels
as orientation evidence. That panel-pair rule was too broad and is retired.
B2.1 identifies a relevant meeting entirely from authored source topology: a
complete TB A/B connection is relevant when its TB source edge on **each** Wall
panel is incident (the preceding or following member of that panel's closed
contour) to that panel's source edge for the W connection. Both incidences must
belong to the same TB connection. A same-panel-pair TB connection elsewhere on
the contours is unrelated.

This identity uses panel IDs, source-edge IDs, connection membership, explicit
A/B roles, and contour incidence. It uses no coordinates, screen direction,
winding, raw edge direction, lexical ordering, insertion ordering, or numeric
part of a W ID. It therefore survives translation, rotation, CW/CCW input, raw
edge reversal, record reordering, and arbitrary W numbers. Multiple relevant
meetings that vote oppositely are ambiguous and fail closed.

## Authoring behavior

With no relevant TB meeting, either W-A/W-B orientation remains authored. With
a consistent relevant meeting, completing a reversed W connection swaps only
the `edgeRole` values of that connection's two assignments. Edges do not move;
TB and other W connections are not mutated. An already matching connection is
an identity-preserving no-op. Persisted malformed state is not repaired during
restore: validation requires exactly one A and one B and rejects reversed or
ambiguous relevant evidence before Apply/future generation.

Completing a Wall connection advances to the next W label, as TB advances to its
next connection, so W1, W2, W3, and further connections can coexist before
Apply. Each retains `operation:W:<connectionId>`, two canonical `REPLACES`
claims, and normal canvas/history snapshot data. Geometry remains explicitly
non-generatable in B2.1.

## B3 seam (locked)

Wall is not a new finger-joint geometry concept. B3 must make W-A physical
behavior identical to TB-A and W-B physical behavior identical to TB-B,
including TB-B terminal/corner tabs. B3 should first characterize current TB
output, then extract or otherwise reuse a shared proven TB/W kernel without
changing TB output. It must not copy a second drifting finger algorithm or add
Wall branches to composition, authority, FinalGeometry, or manufacturing.

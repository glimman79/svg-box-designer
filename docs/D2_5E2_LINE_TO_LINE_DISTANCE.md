# D2.5e2 Line-to-Line Distance architecture

`LINE_TO_LINE_DISTANCE` is a normal persisted Drawing Dimension. It stores only a canonical, lexically ordered pair of Line entity references, a positive target, a stable signed side, and derived annotation placement. It does not create points, witness entities, or a standalone `PARALLEL` constraint.

## Relation and mathematics

The pure line-pair resolver rejects a Line whose support direction has length at most `1e-7 mm`. Otherwise it normalizes both directions and classifies the pair as parallel when the absolute 2D cross product of the unit directions is at most `1e-9`. Oppositely ordered Lines therefore classify identically. Everything else follows the existing Angle branch (which may still fail closed under its own remote-intersection safeguards).

A canonical direction is chosen from canonical Line A by forcing its unit tangent into the positive-x half-plane (positive-y at vertical). Its left normal is therefore stable despite endpoint order. The measured value is the absolute dot product of `(B.start - A.start)` with this normal: the shortest distance of the infinite supports. `signedSide` records the sign at creation and supplies deterministic edit direction; cursor coordinates never define semantic side.

## Rank and solving

The Driving Dimension contributes exactly one scalar distance Jacobian row over the four referenced endpoint point IDs. Parallel preservation contributes **no additional persistent equation and no hidden rank**. Instead, edit movement candidates are constrained to rigid translation along the canonical normal. Every point in the selected Line's topology component receives the same vector, so selected Line direction, length, parallelity, and shared-point topology are preserved exactly.

Candidates are sorted by usable DOF, isolated-versus-connected topology, entity/point/shared-point count, existing Driving-constraint interference, and finally stable entity creation order. Click order is absent from this decision. Each candidate is applied to an immutable copy and all Driving Dimensions are verified; failures proceed to the next candidate, then reject atomically. A pair in the same topology component has no legitimate one-sided rigid translation and is rejected. This intentionally conservative fallback does not rotate or locally distort a measured Line.

Zero is accepted without clamping. A successful rigid translation makes the infinite supports coincident while retaining both finite Lines and their topology; if existing Driving constraints prevent that translation, the edit is rejected atomically.

## Presentation and history

The cursor changes only the along-support annotation offset. Both endpoints of the arrowed Dimension line are derived projections on the two infinite supports, making the main line perpendicular and its length invariant under cursor movement. Witness graphics remain render-only. Creation and successful edit pass through the existing single document transaction path; cancellation and rejected solves do not transact.

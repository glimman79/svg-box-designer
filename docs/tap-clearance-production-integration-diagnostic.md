# Tap Clearance production-integration diagnostic

The compiled `npm run diagnose:tap-clearance-production` fixture isolates Tap Clearance at
`-0.90 mm`, with Profile Offset, Slot Clearance, and Kerf at `0.00 mm`. It models the reported
six-profile layout and traces stable panel/profile identities rather than screen position.

The first loss is **PROJECTION_MISSING**. All six semantic profiles survive the FinalGeometry to
ManufacturingGeometry clone and all six have complete, unambiguous generated-item-local
projections. Upper and lower projections occur in their owning assembled contours and therefore
reach the accumulated contour masks and Geometry Services. Left, center-A, center-B, and right
belong to panels whose assembled replacement contour does not contain their projected primitives;
they consequently contribute zero mask segments and Geometry Services is never called for them.

This is consistent with multiple panel-boundary generated items targeting one panel: FinalGeometry
selects one replacement per panel, while its diagnostic semantic shadow is flattened from every
generated item. The production mapper does not rebuild projections; it uses the same projection
metadata, but tries to match it against the selected final replacement contour. The corrective work
belongs in a separate FinalGeometry/generated-item composition PR because changing that assembly is
outside this diagnostic's strict manufacturing scope.

The diagnostic also proves that masks are unioned for multiple profiles, cloning retains contour
IDs and segment order, semantic eligibility is invariant, successful reconstruction changes
coordinates, and zero-valued later stages do not replace the Tap Clearance result. No production
policy, geometry service, generator, manufacturing stage, settings, serialization, or UI code is
changed by this PR.

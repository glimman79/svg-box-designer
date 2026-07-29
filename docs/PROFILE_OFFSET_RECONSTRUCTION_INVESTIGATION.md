# Profile Offset reconstruction investigation

## Result

The first divergence is **intersection reconstruction**. The selected masks,
cloned manufacturing contours, run detection, offset distance, winding, and
offset-side construction all remain valid. At a profile boundary that lies in
the middle of a straight source edge, the displaced selected side and its
unchanged neighbour are parallel. `lineIntersection` correctly returns `null`;
selective reconstruction incorrectly treated that expected transition as a
fatal intersection failure.

The working lower profile reaches non-collinear contour corners at its entry and
exit. Both offset lines therefore intersect their unchanged neighbours. The two
right-panel profiles terminate at generator-authored attachment anchors on
straight edges. Each has a selected/unselected collinear transition, and was
sent through the same selective Geometry Services code path as the working
profile. Direction (horizontal or vertical), winding, profile identity, and
sharing a panel are not causal.

## Stage comparison

| Stage | Lower (working) | Right A (failed) | Right B (failed) |
| --- | --- | --- | --- |
| Generated identity / attachments | Present and stable | Present and stable | Present and stable |
| FinalGeometry segment provenance | Complete | Complete | Complete |
| Resolved mask / manufacturing clone | Aligned with points | Aligned with points | Aligned with points |
| Selected run / transitions | One run, two transitions | One run, two transitions | One run, two transitions |
| Offset sides | Finite, non-degenerate | Finite, non-degenerate | Finite, non-degenerate |
| Transition line relationship | Non-parallel | Parallel at a straight attachment | Parallel at a straight attachment |
| Old intersection count | One per reconstructed vertex | Stops at first `null` | Stops at first `null` |
| Old diagnostic | None | Generic safe-failure diagnostic | Generic safe-failure diagnostic |

No points are removed at the provenance transitions: cleanup deliberately
preserves those collinear anchors. That preservation exposes the missing case
in reconstruction. There is no duplicated vertex or zero-length source segment,
and no alternate Geometry Services path is selected.

## Hypothesis disposition

* **A, K:** disproved by rotating the regression contour; direction and result
  rotate consistently.
* **B, C, D, I, L:** correlated topology can determine whether an attachment is
  straight, but none is independently causal. The exact predicate is a
  selected/unselected transition whose two reconstructed lines are parallel.
* **E:** disproved; all profiles have entry and exit transitions.
* **F, G, J:** disproved; ordered masks align and source segments are unique and
  non-zero-length.
* **H:** disproved; the required transition vertex is preserved rather than
  removed.
* **M:** disproved; all selected boundary profiles use
  `compensateProfile`/selective reconstruction.

## Correction and regression coverage

At a parallel selected/unselected transition, reconstruction now preserves the
end of the preceding reconstructed side and the start of the following side.
The short segment between them is the required displacement transition. A
parallel pair with equal selection state remains a failure, so genuinely
unreconstructable geometry is not accepted.

The regression exercises both horizontal and rotated vertical straight-edge
attachments and asserts every reconstructed coordinate. Earlier tests covered
horizontal and vertical feature geometry whose selected extents ended at
non-collinear panel corners; the only straight-edge-anchor assertion checked
for a non-null result, but the repository's TypeScript runtime test harness is
currently unavailable with the installed TypeScript 7 package, so that latent
failure was not executed in this environment.

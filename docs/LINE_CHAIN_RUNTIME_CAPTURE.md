# Line-chain manual/continuation runtime capture

## Investigation status

Baseline `eeb834c89d4e2735efcaa60af667272f0ef1712e` does not reproduce the reported
manual-versus-continuation divergence in the production-path regression. With
the same committed document, start coordinate, start SketchPoint identity,
pointer trajectory, transform, and modifier state, the two paths produce equal
candidates, direction authority, positional authority, effective geometry,
semantics, and presentation. Per the investigation rule, no inference behavior
has been changed without a failing reproduction.

## Capture procedure

1. Open browser developer tools and preserve the console log.
2. Construct the working manually restarted Line case, including direction
   acquisition, natural forward travel, the intended target, slight travel past
   it, travel back, and the accepting click.
3. Copy the JSON printed after `DRAWING_DIRECTION_DIAGNOSTIC_CLICK_COPY`.
4. Reload the same document and repeat the exact pointer trajectory for the
   failing continuous-chain case, then copy its click JSON.
5. Provide both JSON values and identify the sequence number at which the visible
   behavior first differs.

Each click payload retains up to 64 frames so initialization is not dropped. It
contains the raw client/model pointer, transform and viewport, active start and
SketchPoint identity, authoritative active-sketch entity order and resolved Line
topology, every positional and direction candidate with screen distance and
construction identity, the complete previous snap channels, selected direction
and position authority, effective point, semantic truth, presentation kinds,
and persistence selection. This is the runtime evidence needed to locate the
first stage whose supposedly equivalent inputs or outputs actually differ.

## Explicit non-changes

This diagnostic does not change candidate generation, candidate ordering,
acquisition/release tolerances, authority lifetime, effective-point resolution,
commit timing, document snapshot selection, Midpoint behavior, topology, or
persistence. It only records values already computed by the production path.

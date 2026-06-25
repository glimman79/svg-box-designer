# E System Baseline v1

This document freezes the current E-system implementation as the baseline before S development begins. It documents behavior only; it is not a UI marker.

## Current E architecture

The E system is implemented in `src/App.tsx` as the Apply pipeline for edge connections. Edge assignments store a connection ID and an optional A/B role. E connection definitions store material thickness, finger width, and whether finger width was manually set. Applying E connections builds per-panel operations from the SVG model, validates closed panel geometry, offsets A and B sides, computes shared tab segment plans by connection ID, and exports one closed path per source panel.

## `createTabSegmentPlan()`

`createTabSegmentPlan(insetLength, fingerWidthMm)` normalizes negative lengths to zero, returns no tabs for effectively zero length, and falls back to one full-length segment when finger width is unavailable or longer than the edge. Otherwise it calculates an odd interior segment count so A and B roles alternate consistently and leaves balanced outer segments at each end.

## `buildTabSegmentPlansByConnectionId()`

`buildTabSegmentPlansByConnectionId(panel, operations)` groups operation side lengths by E connection ID for a panel, records the finger width for each connection, and creates a plan from the shortest source side length. If same-connection side lengths differ beyond tolerance, the implementation warns and uses the shortest length. The Apply path then merges per-panel plans across panels by connection ID so matching E IDs share the same tab rhythm.

## `applyTabsToContour()`

`applyTabsToContour(panel, contour, tabOperations)` walks the already inset panel contour side by side. For each tabbed side it computes the outward side at material thickness, orients/mirrors tab segments according to the original side orientation, clips original segments to the inset side, and emits base-to-outward tab points. It then removes interior backtrack spurs and validates the resulting closed contour.

## B-B corner handling

When two adjacent sides on the same panel are both B roles, both sides have already been inset before tabs are drawn. `addBBCornerJoin()` explicitly reconnects the inset corner out through the original outside corner using outward offset sides and their intersection. This keeps B-B outside corners closed and avoids losing the original corner. The subsequent spur cleanup removes zero-area backtracks, including seams across the implicit close path.

## Export pipeline

`buildAppliedEPanelPaths()` returns applied path records containing the source panel ID, source erase bounds, original erase path, new applied path data, and the original panel edge IDs. `exportFinalGeometrySvg()` writes a fresh SVG with the original root viewBox and original width/height attributes when present. It emits one path per source panel, using the applied E path when available and the original closed panel contour otherwise.

## Known assumptions

- E Apply only runs on panels that validate as closed contours with matching edge IDs.
- Panel edge order matches contour side order.
- E tabs are generated from straight contour sides and use the shortest side for same-ID synchronization.
- The current baseline preserves source SVG export dimensions rather than expanding the root to tab extents.
- A/B ownership is per edge assignment; missing E roles default to A when operations are built.
- S, C, and P systems are outside this baseline.

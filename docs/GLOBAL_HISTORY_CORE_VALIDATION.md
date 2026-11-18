# Stage C PR 3 validation

Baseline: `0488003135a49069f7088f8a9281cf00eab725de`; isolated branch
`stage-c-pr3-global-history-core`. Results are from 2026-11-18. See the
[API, ownership and limits](GLOBAL_HISTORY_CORE.md). This is pure-core and existing
application regression evidence, not active global Undo/Redo or user acceptance.

## Baseline and scope checks

- Fresh `git ls-remote origin refs/heads/main` matched the supplied #638 merge SHA.
  GitHub metadata confirmed #637/#638 merged. #637's merge is an ancestor of baseline.
- #638 was squash-merged: its final head `e330db507db9aab3807e9f1385513bdbef5ee681`
  and baseline have the identical tree `81dff7518b2c0c1afe0b94d31e3b5e458a7a0009`,
  verifying the exclusive-import correction is included.
- Immediately before editing, the task branch was clean at the exact verified baseline.
  No source changes intervened after #638; the older initial checkout was left intact.
- The only production source addition is `src/app/projectHistory.ts`, which has a
  type-only import. No existing production source file was changed. No App/owner/UI
  caller, synchronization effect, adapter or local history-limit change was added.

## Focused pure tests

| Exact command | Result |
| --- | --- |
| `npm run test:project-history` | **40/40 PASS**, plus strict fixture/API type checks |
| `npm run test:project-state` | **16/16 PASS**, plus existing strict boundary type checks |
| `npm run test:project-owner` | **29/29 PASS**, including real production-adapter/import-lock checks |

The new suite reuses the typed PR #637 empty/populated fixtures, including real TB/S
mixed composition and W geometry prepared before history creation. It covers:

- Empty/one/30/overflow histories, all retained endpoints, deterministic oldest eviction,
  full Undo/Redo, partial-Undo branching, combined retention and a 500-action deterministic
  reference-timeline sequence.
- Explicit accepted/rejected/no-op outcomes; no semantic deep equality; nested accepted
  children producing one outer transition; child noop savepoints; sticky nested rejection,
  thrown and caught updater/child exceptions, first-error preservation, reentrant failure,
  invalid/async decisions/updates and closed scope handles.
- Exact stored frame and action-metadata identity; Redo preservation on no-op/rejection/
  exception; separate UI navigation; fresh initialization/reset including the same frame.
- Full DrawingDocumentV2/Sketch maps/order/identity; shared and equal-coordinate-distinct
  points; Circle and both Arc orientations; Dimensions/Constraints/references/roles/
  placements/solved coordinates; original SVG and parsed source; BOX PM pending/applied
  distinction; TB/W/S groups, assignments and order; manufacturing target/settings/Apply
  stamps; complete output/operations/timestamps and every composition-marker state;
  separate BOX restoration context with no fallback.
- A compiled-core VM that forbids imports, clocks, cloning and runtime services, while
  executing initialization, transactions, Undo/Redo and reset. Traversal returns exact
  stored references and cannot import a solver, parser, generator or authority selector.
- Deep runtime freezing/type-level read-only contracts; detachment before subsequent
  internal/external mutation; mutable candidate reuse; shallow-frozen input isolation;
  independent projections. A synthetic large SVG plus 5,000 generated items remains
  shared through 30 Drawing changes and one BOX settings change with zero
  `structuredClone` calls during those edits.

These checks do not measure real-project heap or latency. They do not test a runtime
global restore barrier, asynchronous action lifetime, native file validation or CAD
intent validation by the core.

## Existing regression commands

All **15/15 selected existing regression commands pass**, run sequentially. The exact
generated `.test-build/package.json` marker was removed before each command, as recorded
for #638, to avoid legacy CommonJS/ES-module marker interference. No source assertions,
fixtures or test contracts were weakened or changed.

| Exact command | Result |
| --- | --- |
| `npm run test:drawing-history-transactions` | PASS |
| `npm run test:drawing-history-controls` | PASS |
| `npm run test:drawing-circle` | 16/16 PASS |
| `npm run test:drawing-arc` | 28/28 PASS |
| `npm run test:drawing-dimension-solver` | PASS |
| `npm run test:drawing-circle-direct-manipulation` | 16/16 PASS |
| `npm run test:drawing-arc-direct-manipulation` | 33/33 PASS |
| `npm run test:drawing-coincidence-drag` | 36/36 PASS |
| `npm run test:generated-geometry-authority-restore` | TB/S/mixed, slots/references, FinalGeometry/manufacturing and fail-closed cases PASS |
| `npm run test:generated-geometry-authority-mixed-evidence` | 19 valid mixed fixtures PASS |
| `npm run test:wall-v2-production-path` | PASS |
| `npm run test:wall-v2-restore` | PASS |
| `npm run test:box-empty-start` | PASS |
| `npm run test:shared-history` | 2/2 PASS |
| `npm run test:workspace-shell` | 5/5 PASS |

This is focused regression validation, not a rerun of the complete #638 138-command
inventory. Counted Node suites and diagnostic/behavior commands are reported separately
rather than inventing one aggregate test count.

## Production build and browser smoke

`npm run build`: **PASS**, TypeScript project build and Vite production bundle.
`git diff --check`: **PASS**.

Five existing browser suites pass in headless `/usr/bin/chromium` with Playwright,
against the real Vite application at `http://127.0.0.1:5173/`, started using
`npm run dev -- --host 127.0.0.1`:

| Exact command | Actual regression coverage | Result |
| --- | --- | --- |
| `npm run test:workspace-shell:browser` | Drawing Line/Circle/Arc/Profile, Dimensions/Constraints, local toolbar/keyboard Undo/Redo, incomplete interactions/navigation, BOX import/PM/TB/export/Clear, viewport controls and three desktop sizes | PASS |
| `npm run test:shared-history:browser` | Stable shared region, Drawing/BOX navigation and local Redo, real PM/TB/W entries, Finish restore/manufacturing output, 18 layouts and native scrolling | PASS |
| `npm run test:contextual-canvas-controls:browser` | PM validation/Apply/Finish, real TB/W/S workflows, manufacturing Apply, rejected Wall Apply, local history, Fit/focus and desktop layouts | PASS |
| `npm run test:project-owner:browser` | Three real TB/W/S projects: SVG import, PM thickness edit/Apply, assignments/properties, Geometry Apply, Finish/local Undo/Redo, manufacturing edits/Apply | PASS |
| `npm run test:svg-import-lock:browser` | Pending read modal/inert/focus and same-event admission, blocked underlying actions, read/parser failures, same-file retry, history preservation and real App unmount/late completion | PASS |

The history core has no production callers, so **none of these browser results proves
global Undo/Redo**. They establish existing local/UI/import regression behavior only.
No Firefox/WebKit or manual user acceptance is claimed. Existing import-lock delay/error
injections are documented by #638 and remain test instrumentation, not state injected
into the new history core. Arc manipulation/Coincidence browser harnesses were not rerun;
their relevant pure suites pass above.

## Remaining risks and integration

The adapter must classify semantic no-ops and supply coherent domain-validated frames;
distinct accepted equal-valued roots are not automatically detected. Callbacks must be
synchronous staging with no externally visible writes. The core's immutable graph cache
provides safe sharing, not a large-project memory budget. Holding old history objects
retains their payloads beyond the active timeline's eviction. Session/revision guards,
stale async rejection, pending actions, interaction cancellation and owner publication
are deferred to separately scoped integration. No existing runtime policy, accepted
CAD behavior or deferred Arc limitation changes. Stage C remains incomplete.

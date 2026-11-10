# Laser Program — Global Workspace UI Specification

**Status: APPROVED PRODUCT REQUIREMENTS; UI-1–UI-4 are PROPOSED / NOT IMPLEMENTED.**

## 1. Purpose, scope and authority

Define one consistent workspace for Drawing, BOX / Construction, Puzzle and future
modules. The seven color labels below refer to the user's annotated-screen description
in the task brief; the screenshot itself was not supplied with this documentation task.
Colors identify regions, not a required application color palette.

This specification owns the approved workspace placement and interaction requirements.
[Product Architecture Vision](PRODUCT_ARCHITECTURE_VISION.md) owns connected-product
requirements; [PROJECT_MASTER.md](../PROJECT_MASTER.md) owns current architecture;
[ROADMAP.md](../ROADMAP.md#4-connected-product-development) owns stage labels/statuses.
The merged [Stage B analysis](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md) remains
the technical reference, with its approved requirements distinct from recommendations
still under review. Merging that analysis did not implement or approve every proposal.

This is documentation only. No UI milestone or A–G stage is completed by this change.
The canvas-only Fit placement below supersedes the earlier future top-bar Fit placement;
other approved history, persistence, Clear and CAD contracts remain in force.

## 2. Verified existing behavior to preserve

Source inspection used GitHub `main` at
`3f1ac4d82a35cf221d4d46c60cdd2434f20b97fd` (merged Stage B PR #629), verified on
2026-11-10. These are source observations, not new browser acceptance:

- [App](../src/App.tsx) has Drawing and BOX navigation and a disabled Puzzle selector.
  Conditional top-bar groups expose Construction Import, disabled Save, Export, Clear,
  Fit, local Undo/Redo, Apply and Finish Group. Drawing has its own controls.
- The bottom Construction `History` region is a single-click workflow-group navigator;
  [DrawingWorkspace](../src/app/DrawingWorkspace.tsx) shows explanatory History text.
  Neither is the required permanent parametric construction timeline.
- Canvas zoom controls already provide Fit in both implemented modules. Construction
  computes bounds; Drawing currently resets a fixed view. Relocation must preserve
  existing functionality; future bounds/3D policy remains separate design work.
- Undo ownership remains separate: Drawing retains up to 100 snapshots in its mounted
  workspace; Construction retains up to 10 in `App`. The target combined 30-step global
  system, native Save/Open and cross-module dependency evaluation are unimplemented.

Preserve accepted Drawing interactions and transaction boundaries, including exactly-once
accepted clicks, per-completed-segment Profile behavior, multi-step tools, cancellation,
incomplete states, Constraints/Dimensions and Circle/Arc semantics. Preserve BOX's
draft-versus-applied behavior and construction/manufacturing pipeline. Moving controls
must not change when an action is accepted or when it creates an Undo entry. Existing
CAD acceptance and deferred Arc limitations remain as recorded in
[Master §4](../PROJECT_MASTER.md#4-2d-drawing-architecture) and the
[Stage B regression risks](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md#12-cad-regression-risks-and-mitigation).
The user's Drawing Undo/Redo verification did not establish a new functional defect.

## 3. Seven approved UI regions

| Annotation | Region and location | Responsibility |
| --- | --- | --- |
| RED | Permanent construction history, bottom | Shared persistent editable operations and diagnostic navigation. |
| GREEN | Module tools, left vertical toolbar | Tools/state belonging to the active module. |
| YELLOW | Module navigation, top bar | Consistent access to implemented and future modules. |
| BLUE | Project commands, top bar | Import/Open, Save, Export, Clear and relevant project-wide commands. |
| GRAY | Fit to Screen, canvas zoom controls only | Viewport fitting; remove the redundant top-bar control. |
| ORANGE | Global Undo/Redo, top bar | Shared project-level chronological Undo/Redo. |
| PINK | Apply / Finish Group, contextual canvas controls | Relevant active-tool/workflow actions. |

### RED — Permanent construction-history timeline

- Provide one Fusion 360-inspired horizontal timeline across all modules at the bottom
  of the workspace, with horizontal scrolling when entries exceed available width.
- Entries represent completed, meaningful construction operations, with stable operation
  identities and editable current parameters. New meaningful operations append entries;
  editing an existing operation updates its entry rather than creating a replacement.
- Double-click opens the operation's current module/settings. It does not rewind the
  project, create an Undo entry, move the Undo cursor or discard Redo. A subsequent
  accepted parameter edit is a normal global Undo action.
- Show appropriate warning/error and blocked-dependency indicators. Clicking an affected
  entry identifies the operation, diagnostics and causal dependency/reference, and gives
  access to editing/repair where supported. Preserve unavailable definitions and explain
  unavailable editing; do not claim every failure is repairable.
- Retain operations beyond the 30-step Undo tape and persist them with the editable
  native project. Switching modules must preserve history and timeline context.

**Migration boundary:** the existing workflow-group navigator is not this operation
model. Review migration/integration with C.2's stable operation references and Stage B's
[operation foundation](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md#9-permanent-parametric-construction-history-and-navigation).
Do not relabel groups/snapshots as permanent operations, fabricate legacy chronology or
introduce a disposable parallel history model. Exact adapters and migration remain design
work; UI-3 may establish the visual shell without claiming functional parametric history.

### GREEN — Module-specific tools

The left vertical toolbar displays the active module's tools; switching modules changes
the available tools. Drawing, BOX, Puzzle and future modules share layout boundaries.
Keep module tool state isolated from unrelated modules and preserve accepted CAD tool
behavior. This specification does not redesign tool sets or define future Puzzle tools.

### YELLOW — Module navigation

Use one consistent top-bar navigation region for Drawing, BOX / Construction, Puzzle
and future modules. Clearly distinguish active, available and not-yet-implemented modules;
visible placeholders are not capabilities. Future modules must fit without restructuring
the whole workspace. Manual switching is navigation, never a construction operation or
Undo action, and preserves project work and Redo.

### BLUE — Global project commands

Group Import, Open, Save, Export, Clear and relevant project-wide commands consistently
in the top bar, separate from module tools. Preserve the approved Open control's
**Open Project / Import SVG** distinction: SVG import targets BOX regardless of active
module; native Open restores the complete editable project with a fresh empty Undo tape.
This does not choose an additional Import-button/menu arrangement.

Save preserves editable state, operations and relationships once native persistence
exists; Export produces output and respects active/explicit scope and manufacturing
validation. Unsupported scope cannot become an advertised capability. Pending, failed,
stale or unvalidated artifacts must not silently export as valid manufacturing output;
any independent valid export requires explicit scope and full validation.

Preserve permanent whole-project Clear: **Save and Clear / Clear Without Saving / Cancel**.
Save and Clear requires successful native Save, including a destination on first Save;
failed/cancelled Save preserves work/history. Clear resets project/module state and
Undo/Redo, is never Undoable and itself never deletes/overwrites saved files. Clear/Open
must reject stale old-session work. These are future contracts, not claims that the
current Construction-only Clear or disabled Save already provides them. See
[Vision §5](PRODUCT_ARCHITECTURE_VISION.md#5-global-toolbar-contract) and
[Stage B persistence](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md#10-native-saveopen-architectural-prerequisites);
no persistence behavior is implemented or redesigned here. Keep unavailable commands
disabled with an explanation rather than presenting them as working features.

### GRAY — Fit to Screen

Remove the top-bar Fit to Screen control during UI-2. Keep Fit only in canvas controls
alongside zoom and preserve its functionality. Fit is viewport navigation: no construction
entry and no Undo step. Future active-module bounds and 3D fitting requirements remain
owned by the Vision; the layout change alone does not solve those gaps.

### ORANGE — Global Undo/Redo

Keep Undo and Redo in the top bar, connected to the shared project-level system once
Stage C exists. Never relocate these controls into construction history. Preserve
Stage B's combined **30-transition** past/future capacity and one logical Undo action
for each accepted state-changing user action, including all automatic downstream
consequences. Navigation contributes none. Undo/Redo restores exact captured outcomes
and opens the edit's associated module. Early placement work must not advertise the
current local owners as an implemented global system or change their behavior.

### PINK — Contextual Apply and Finish Group

Remove Apply and Finish Group from the permanent top bar. Show them on the canvas
only when relevant to the active tool/workflow, following the established contextual
constraint-control interaction concept where appropriate. Make controls discoverable
without permanent global-toolbar space, avoid unnecessarily obscuring geometry, and
hide them when the associated workflow ends. Not every tool requires these actions.

Preserve Apply, Finish Group, cancellation, incomplete-state and accepted-action
semantics. Relocation must neither force completion nor accept/cancel work implicitly,
lose an accepted action, or create/merge Undo steps. Exact positioning and shared-control
implementation remain deferred; contextual constraint behavior is a reference concept,
not proof that a reusable Apply/Finish component already exists.

## 4. Construction history, Undo/Redo and dependencies

| System | What it represents | Effect of editing an existing operation |
| --- | --- | --- |
| Permanent construction history | Current editable operation definitions, stable references and dependencies; project-persistent, no Undo quota. | Update the same operation and entry. |
| Global Undo/Redo | Up to 30 chronological reversible project-edit transitions across modules. | Record one accepted edit including all automatic consequences. |
| Dependency evaluation | Affected input/output relationships and current results/diagnostics. | Re-evaluate the affected closure; retain unrelated authored work. |

Example: Drawing operation → BOX operation → finger joints → later dependent operations.
Editing the earlier Drawing operation updates it in place and propagates through the
affected dependency closure. Valid downstream operations update. **Approved Option A**
keeps a valid source edit and retains failed operations with their parameters/references
and diagnostics; consumers blocked by those failures remain present and marked. Entries
provide inspection and repair access where possible. Do not silently delete definitions
or guess substitute references.

Unrelated operations must not regenerate unnecessarily. A newly created Drawing object
unrelated to an existing BOX's entity input must not trigger that BOX's regeneration.
Profile-, sketch- or source-set dependencies can legitimately be affected by added
geometry. Do not substitute module-wide invalidation for dependency tracking.
Automatic outcomes belong to the originating user action, never a second regeneration
Undo step. Stage E refines responsive unrelated authoring and evaluation; this UI plan
does not select a scheduler. See the authoritative
[Stage B dependency contract](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md#11-dependency-boundary-option-a-and-partial-regeneration).

## 5. Proposed UI-1 through UI-4 delivery plan

All milestones below are **PROPOSED / NOT IMPLEMENTED**. They complement the existing
A–G roadmap without renumbering it or changing any stage's status.

### UI-1 — Shared workspace shell

**Scope:** consistent top/module navigation, global project-command and Undo/Redo regions,
module-specific left toolbar and shared layout boundaries. May be delivered early as an
isolated placement change aligned with A — Shared toolbar; functional global ownership
and command enablement wait for their underlying stages.

**Acceptance criteria:** Drawing and BOX interactions remain functional; active/available/
unimplemented modules are clear; tools remain isolated; no Undo behavior changes;
future modules can use the shell without restructuring it; disabled native/global
capabilities are not presented as implemented.

### UI-2 — Contextual canvas controls

**Scope:** remove top-bar Fit, retain canvas Fit, and relocate relevant Apply/Finish Group
controls to the canvas, aligning with contextual constraint interactions where appropriate.
May follow UI-1 early as an isolated change; does not require the dependency engine.

**Acceptance criteria:** existing workflows remain operable; controls appear only when
relevant and disappear on workflow exit; geometry is not unnecessarily obscured;
Fit still works; multi-step tools, cancellation and incomplete operations preserve
their accepted semantics; no accepted action is lost and Undo boundaries remain unchanged.

### UI-3 — Construction-history timeline shell

**Scope:** shared bottom layout, horizontal overflow/scrolling, selection/navigation
boundaries, labels/icons/diagnostic space and an integration boundary for real project
operation references. Fits the shared shell and can precede the completed operation
foundation; it must not simulate missing history features with workflow groups.

**Acceptance criteria:** no alternative/throwaway operation model; groups are not labelled
as permanent operations; switching modules preserves timeline context; real stable
references can be bound later. Parameter editing/diagnostics are not advertised before
their real model and adapters exist.

### UI-4 — Construction-history integration

**Prerequisites:** C shared project/global Undo, proposed C.2 persistent operations and
parameter/current-settings bindings, D native persistence for saved-history behavior,
and the necessary E evaluation/diagnostic/repair foundations. Deliver incrementally
with these foundations; UI-4 is not independently implementable as a shell-only task.

**Scope:** bind persistent operations and stable identities, double-click current settings,
diagnostic indicators and supported repair navigation; synchronize with global Undo/Redo
and affected dependency evaluation without merging the systems.

**Acceptance criteria:** new completed meaningful operations add entries; repeated edits
update the same identity/entry; double-click inspects current settings without rewind or
Redo loss; invalid/blocked entries remain accessible; affected closures update under
Option A while unrelated operations remain unchanged; Undo/Redo captures the originating
action and consequences once; native Save/Open retains construction history after its
foundation is implemented while Open starts a fresh Undo tape.

### Alignment with the existing architecture stages

| Existing roadmap label | UI dependency / boundary |
| --- | --- |
| A — Shared toolbar | UI-1/UI-2 refine placement; Fit moves to canvas. Placement never proves command functionality. |
| B — Global project/history architecture design | Merged Stage B document remains the technical reference; preserve its separation of requirements and proposals. |
| C — Global history implementation | Shared project foundation and global Undo/Redo; required for UI-4 synchronization. UI-1 placement can precede it. |
| Proposed C.2 — permanent construction-history foundation | Stable persistent operations, bindings and current-settings navigation for UI-4; UI-3 must use this boundary, not duplicate it. Still proposed. |
| D — Native Save/Open | Preserve complete editable operations/relationships; saved-history acceptance requires this stage. Coordinate with C.2 before format freeze. |
| E — Geometry transfer and dependencies | Affected propagation/regeneration, diagnostics and repair for UI-4; not part of early layout work. |
| F — Simple 3D Modeling | Optional future module; extend the shared shell when implemented. Not a prerequisite for Drawing-first UI work. |
| G — Puzzle | Future module uses the same structure when implemented; not an existing capability. |

## 6. Non-goals and deferred details

No React/CSS/state/tool changes, tool-set redesign, persistence implementation, new
history store, solver changes or broad architecture redesign. No A–G status changes,
completed UI milestones, new CAD/browser acceptance, release dates or reopening Option A.
Preserve historical and accepted evidence. Operation catalog/grouping, legacy migration,
exact menu/overlay placement, identity adapters, native schema, dependency scheduler,
repair algorithms, 3D and Puzzle details remain with their existing architecture stages.
The approved regions and interactions constrain that future design without selecting
unverified implementations.

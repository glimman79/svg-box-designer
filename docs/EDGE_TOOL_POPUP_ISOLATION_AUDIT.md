# Edge tool popup isolation audit

## Updated canvas-selection hypothesis

Real Edge evidence now shows the contextual popup even when `event.target`,
`elementFromPoint`, and the start of the composed path are the root `svg`. In
that failing run, the DOM selection was non-collapsed and selected nearby
diagnostic HTML (`"Last "`). SVG graphical-child identity is therefore no longer
the leading hypothesis. Normal browser text selection initiated by a CAD-canvas
double-click is the leading explanation, but remains unproven until the new
selectable/local-`user-select: none` A/B is completed in real Edge.

The development-only `/edge-canvas-repro` now places each diagnostic readout
outside its selection-test region and records target, `elementFromPoint`, full
selection state, anchor/focus nodes, and a manual popup observation. Production
CAD viewport selection remains unchanged until that real Edge comparison proves
that local suppression eliminates both the DOM selection and popup.

## Scope and status

This audit starts at `c69bbc4053ea20139be736acf949be2597a25d06`, which includes the C4 event-completion and diagnostic work. The Edge popup root cause is **not proven** without the real-browser comparison below. No new popup-suppression mechanism was added.

The development server exposes `/edge-tool-repro`. The route is gated by `import.meta.env.DEV`, is dynamically loaded, and does not load the application or its stylesheet. Case 1 is an unstyled semantic button with no handler. Case 2 adds only `user-select: none` and `-webkit-user-select: none`. Case 3 adds only a non-cancelling local `pointerdown` state update. Case 4 locally reproduces the 350 ms / 6 px normal-then-persistent activation model without importing Drawing lifecycle code.

## C1–C4 audit

| Mechanism | Introduced for | Current role | Keep/Remove/Review | Reason |
|---|---|---|---|---|
| Tool-button `user-select` | Popup/selection suppression | Scoped selection suppression | REVIEW | Isolated Case 2 must establish whether it changes Edge behavior. It is scoped and does not alter global selection. |
| `pointerdown` `preventDefault` | Popup/selection suppression | Owns primary pointer start before tool activation | REVIEW | Removing it before the real Edge comparison would be blind cleanup. |
| `mousedown` `preventDefault` | Compatibility-mouse popup suppression | Compatibility fallback after pointer handling | REVIEW | Its value depends on the first repro transition and Edge's compatibility event path. |
| Scoped `selectionstart` listener | Popup/selection suppression | Cancels selection only inside the Drawing rail | REVIEW | It is not global, but its necessity cannot be determined locally. |
| `pointerup` `preventDefault` | C4 completion suppression | No lifecycle or activation role | REMOVE — redundant with newer implementation | Pointer activation happens on `pointerdown`; completion cancellation neither activates nor focuses a tool and did not solve the popup. |
| `mouseup` `preventDefault` | C4 compatibility completion suppression | No lifecycle or activation role | REMOVE — redundant with newer implementation | It duplicates completion cancellation and has no accepted CAD behavior owner. |
| Custom double activation | Accepted CAD lifecycle | Immediate normal activation, then persistent activation within 350 ms / 6 px | KEEP — required by accepted CAD lifecycle | It supplies product behavior independently of the failed popup workaround and avoids native `dblclick` activation authority. |
| Event diagnostics recorder | C4 popup investigation | Opt-in production-Drawing event recording | REMOVE — diagnostic-only production baggage | The isolated page now provides the intended comparison without wiring a recorder into Drawing. |
| Explicit focus restoration | Accessibility after cancelled default | Restores native button focus after primary default cancellation | KEEP — independently useful product behavior | While pointer default remains cancelled, explicit focus preserves visible and keyboard focus semantics. |
| C1–C4 tests | Regression coverage for successive work | Mixed lifecycle and suppression assertions | KEEP/REMOVE | Lifecycle, semantic-button, scoping, and canvas-finish assertions remain; assertions requiring removed completion suppression and diagnostics were replaced with cleanup assertions. |
| `.cad-tool-button *` selection CSS | Descendant popup suppression | Duplicated the button rule for nonexistent control descendants | REMOVE — redundant with newer implementation | Both current Drawing and Box controls contain text only, so the descendant selector adds no behavior. |

## Cleanup and safety

Removed the Drawing diagnostic import, effect, ref, activation logging, and the diagnostic module. Removed `pointerup`/`mouseup` capture handlers and their functions. Removed redundant descendant selection CSS. Retained the scoped start/selection mechanisms pending real Edge evidence, the focus restoration required by the retained cancellation, and custom persistent activation.

The cleanup does not touch Box files or geometry files. Drawing retains Select before Line, top-aligned rail layout, active-tool styling and authority, immediate and persistent Line activation, canvas double-click finish, Escape exit, right-button pan, wheel zoom, Ctrl override, endpoint/line snapping, and 22.5-degree angular snap.

## Real Microsoft Edge test plan

1. Start the development server with `npm run dev` and open `/edge-tool-repro` in Microsoft Edge.
2. Double-click or rapidly activate each of Cases 1–4 in order, using the same mouse and cadence.
3. Open the normal application Drawing workspace and perform the same activation on Line.
4. Record the result without changing browser settings between cases.

| Target | Copilot/Mini Menu appears (YES/NO) |
|---|---|
| Case 1 — Native button | |
| Case 2 — user-select none | |
| Case 3 — pointer handler | |
| Case 4 — custom double activation | |
| Normal Drawing Line tool | |

## Decision matrix

- If Case 1 triggers the popup, the behavior occurs on minimal native content. Stop adding layered application suppression; make a UX/product decision or provide browser-setting guidance.
- If Case 1 does not trigger it but a later repro case does, the first failing transition is the next root-cause target.
- If Cases 1–4 do not trigger it and only normal Drawing does, compare Drawing's DOM and events with Case 4; that delta is the root-cause search space.
- Until one of those outcomes is observed in real Edge, do not claim a root cause or implement another popup fix.

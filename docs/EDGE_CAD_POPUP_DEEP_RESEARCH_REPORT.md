# Edge CAD Popup Deep Research Report

Date: 2026-08-31
Repository baseline: `b71a42a` (`Add minimal Edge SVG structure bisect (#408)`)
Scope: research and static analysis only. No popup fix, diagnostic, repro, or lifecycle change is part of this task.

> **Evidence boundary.** Repository evidence was inspected directly. The execution environment denied live external HTTP access (`401` from the web research service and `403` from Microsoft Learn, GitHub, and raw GitHub over `curl`/Git), so external sources could not be re-opened or version-checked during this task. The external section therefore separates official claims and stable source locations known from published documentation from inferences, and it does **not** claim that an Edge-version-specific site workaround has been proved. Direct URLs are recorded so that a connected review can verify them before implementation.

## 1. EXECUTIVE CONCLUSION

### What is known

The following real-browser facts are the investigation baseline and are preserved without reinterpretation:

- In Microsoft Edge, unwanted Edge/Copilot/Mini Menu browser chrome appears in the real Drawing canvas on double-click.
- It appears when Line is active and double-click finishes a Line chain.
- It also appears when Select is active and an apparently empty Drawing area is double-clicked. Therefore `finishLine()` is **not required**.
- The clean structural bisect produced **no popup** for an empty SVG, an empty SVG with a native `dblclick` handler, an empty group, `defs`, empty/unused patterns, pattern plus full grid rect, solid rect, pointer-transparent rect, line, pointer-transparent line, path, circle, axes, or grid plus axes.
- SVG text produced no popup from empty area but did produce the popup when `100` itself became selected.
- Therefore the grid, geometry, native `dblclick`, and SVG child structure are each insufficient on their own.
- Earlier diagnostics observed nearby text such as `Last`, `Canvas`, and `Fit` becoming selected after a canvas double-click. Those pages contained diagnostic/readout text, so that evidence is contaminated.
- A separate selectable versus local-`user-select:none` A/B produced no popup in either arm. Normal DOM text selection is therefore **not proved to be the sole cause**.

The repository also proves that popup-specific suppression accumulated around the **tool rail**, while the currently reproduced popup occurs in the **canvas** even with Select active. Tool-button CSS, tool-rail `pointerdown`/`mousedown` cancellation, tool-rail `selectionstart` cancellation, and focus restoration consequently do not explain or prevent the current canvas symptom.

### What is not known

- No captured screenshot or Edge accessibility/UI metadata in the repository positively identifies the vertical chrome.
- No test has shown which default action, selection range, first-click state transition, ancestor, overlay, or browser feature is necessary in the real Drawing environment.
- No Microsoft documentation located by title/policy name describes a supported per-element API for disabling the Edge mini menu.
- No clean case reproduces the real Drawing failure, so the root cause is not isolated.

### Strongest current theory

The strongest theory is **an Edge text-selection/contextual-action pipeline triggered by the complete real-workspace interaction context**, not by line completion or SVG geometry. The direct SVG-text result and Edge's documented mini-menu relationship to selected text support that theory. The clean A/B null result and clean structural bisect prevent elevating it to a root cause. A competing theory is that another Edge contextual feature (Copilot contextual actions rather than the classic text-selection mini menu) uses a broader trigger in the real page.

This distinction matters:

1. **Feature question:** which piece of Edge chrome appears, and what browser signal invokes it?
2. **application question:** what narrow CAD interaction contract prevents an ordinary gesture from accidentally generating that signal?

The browser setting can help answer the first question; it is not an acceptable answer to the second.

## 2. REPOSITORY HISTORY AUDIT

### Chronology

| Change | Original reason | Current status | Evidence | Keep/remove later? |
|---|---|---|---|---|
| `#400` / `1c2a1ac`: `.cad-tool-button` standard and WebKit `user-select:none`; native Line `dblclick` called `preventDefault()` | C1: active tool styling plus an attempted suppression of selection/browser UI on tool chrome | **UNPROVEN** for popup; still production | Scoped only to tool buttons. Current popup occurs on canvas and the later local selection A/B did not reproduce either way. | Review removal separately after validating ordinary product selection behavior; do not extend to canvas merely because it exists. |
| `#401` / `21f4a7a`: tool-rail capture `mousedown.preventDefault()`, explicit button `.focus()`, native `selectionstart.preventDefault()` | C2: stop compatibility-mouse text selection early while retaining keyboard/focus semantics | **UNPROVEN** for popup; still production | No real-Edge evidence proves it affected the popup. It is scoped to the `aside`, not the Drawing SVG. | Audit as one suppression package; do not add another canvas layer to it. Keep focus restoration only while cancellation remains. |
| `#402` / `e915456`: tool-rail capture `pointerdown.preventDefault()` and focus restoration | C3: cancel earlier than compatibility mouse/double-click synthesis | **UNPROVEN** for popup; still production | The source comment asserts an Edge synthesis mechanism that was not proved. Select-active canvas reproduction makes tool activation unnecessary. | Candidate for later isolated removal/retention review; not evidence for a canvas fix. |
| `#402` / `e915456`: custom 350 ms / 6 px double activation on tool `pointerdown`; keyboard `click` retained; native tool `dblclick` removed | Preserve immediate activation followed by persistent Line activation without browser-native double-click authority | **KEEP** | Independently implements accepted CAD tool behavior and keyboard/pointer separation. It is not needed to reproduce the canvas popup. | Keep as product behavior unless product requirements change. |
| `#403` / `c69bbc4`: `pointerup.preventDefault()` and `mouseup.preventDefault()` on tool rail | C4: “own” gesture completion and neutralize an assumed Edge completion path | **HISTORICAL** | No accepted lifecycle owner and no popup success; removed in the next commit. | Already removed; do not restore. |
| `#403` / `c69bbc4`: tool event recorder in real Drawing | Capture pointer/mouse/click/dblclick/selection/context sequences and activation snapshots | **HISTORICAL** | Production-Drawing wiring was diagnostic baggage and was removed in `#404`. | Already removed; do not restore. |
| `#403` descendant `.cad-tool-button *` selection rule | Suppress selection in possible button descendants | **HISTORICAL / OBSOLETE** | Current controls had text nodes, not descendant elements; removed in `#404`. | Already removed. |
| `#404` / `b75c4e8`: `/edge-tool-repro` Cases 1–4 | Isolate native button, `user-select`, pointer state update, and custom double activation from application code | **DEV-ONLY** | Useful isolation scaffold, but its tool target no longer matches the canvas reproduction. | Removable after evidence/report preservation; never ship as product mechanism. |
| `#404`: focus restoration retained | Preserve focus after cancelling native pointer/mouse default on buttons | **KEEP conditionally** | It compensates for retained cancellation and supports visible focus; it does not suppress the canvas popup. | Keep only as long as the cancellation requiring compensation remains. |
| `#405` / `e83b92a`: `/edge-canvas-repro` and opt-in real-canvas diagnostics | Compare empty SVG versus handler and capture real Drawing event/selection state | **DEV-ONLY** | It established useful observations but also introduced nearby readout words later selected by Edge. | Removable later; do not treat diagnostic text selection as root-cause proof. |
| `#406` / `432e200`: hit-target matrix and expanded target/path diagnostics | Test direct geometry, pointer transparency, invisible hit strokes, SVG text, and HTML overlays | **DEV-ONLY**; geometry hypothesis now **OBSOLETE as a sufficient cause** | Clean bisect reports geometry and pointer transparency do not distinguish popup/no-popup. SVG text selection remains relevant but is not the empty-area case. | Preserve report, then remove repro when investigation closes. Do not change production hit targets on this evidence. |
| `#407` / `842b252`: selectable versus local `user-select:none` CAD-region A/B | Test ordinary DOM selection as leading hypothesis without event cancellation | **DEV-ONLY**; popup-specific conclusion **UNPROVEN** | Neither A nor B reproduced the popup. The result does not prove CSS ineffective in the real Drawing, but it disproves the A/B page as a reproducer. | Do not promote CSS solely from this test. Repro may be removed later. |
| `#408` / `b71a42a`: clean 16-case SVG structural bisect | Remove diagnostics/application structure and identify a minimal SVG child trigger | **DEV-ONLY**; strongest negative evidence | Cases 0–12 and 14–15 did not pop; SVG text popped only when directly selected. | Retain results in this report; page can be removed later after review. |
| Real Drawing opt-in diagnostics (`edgeCanvasDiagnostics=1`) | Capture the actual workspace rather than infer from a synthetic page | **DEV-ONLY** | Development-gated and opt-in, but diagnostic overlay/readout can alter selection candidates and page layout. | Removable later; keep disabled for the next behavioral experiment. |
| Canvas native `onDoubleClick` | Finish Line construction | **KEEP** product behavior, but unrelated to feature necessity | Select reproduces the popup while the handler does nothing; clean empty SVG with `dblclick` does not pop. | Do not change Line lifecycle in this investigation. |

### Audit conclusion

The current production is layered: four mutually reinforcing selection/default/focus mechanisms remain around tool chrome (`user-select`, pointer cancellation, mouse cancellation, and `selectionstart`, with focus restoration compensating for cancellation). None is proved useful against the now-reported **canvas** popup. The custom activation is different: it owns required product semantics and should not be mislabeled as a workaround merely because it arrived during the same sequence.

## 3. CLEAN BISECT VS REAL DRAWING DELTA

The clean Case 15 is a single page-level `main` containing one case frame and one SVG. It has inline width/height/display/border/background, `viewBox`, patterns, rect, and axes. It has no application stylesheet and no application state. The real canvas differs as follows, ranked by plausible relevance rather than asserted causality.

### 1. Selectable text and absolutely positioned sibling chrome in the same canvas frame

The real SVG shares a positioned `.canvas-frame` with:

- `.drawing-status`, containing sketch name, unit, grid, and `Active Tool` text; it is absolute, `z-index:3`, and `pointer-events:none` but does not have `user-select:none`;
- `.canvas-zoom-controls`, containing `+`, `−`, and `Fit` buttons and text;
- a second, absolutely positioned SVG coordinate-label overlay at `z-index:2`, with `pointer-events:none`; only its `text` has `user-select:none`;
- when enabled, an absolute diagnostic panel at `z-index:5` with buttons and extensive selectable text.

Pointer transparency affects hit testing, not necessarily Selection API range construction. The historical selection of `Fit`, `Last`, and `Canvas` makes sibling/ancestor text a real delta, though contamination means it is not a proved trigger.

### 2. Real React interaction and state transitions on the first and second press

The real SVG has React synthetic `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `pointerleave`, `contextmenu`, and `dblclick` handlers. On Line's first primary `pointerdown`, it resolves transforms/snaps, updates multiple React states, and schedules a 220 ms commit. A second press with `event.detail > 1` exits early; `dblclick` cancels the pending commit and finishes the construction. On Select, the two primary pointerdowns cause no tool action, while native click/double-click defaults remain available. Case 15 has none of this state, timing, rerender, or event topology.

This is the most meaningful event delta, but Select reproduction means Line-specific mutations are not necessary.

### 3. Native wheel capture and shared pan/context behavior

The real root has a non-passive native `wheel` listener that prevents default and stops propagation. Right-button `pointerdown` prevents default, sets pointer capture, and changes pan state; `contextmenu` is always prevented on the SVG. These are mature CAD interactions but are absent from the clean case. They should not affect an ordinary primary double-click according to normal event scoping; no evidence currently links them to the popup.

### 4. Deep application ancestor hierarchy and CSS layout

The real chain is approximately `main.app-shell > section.drawing-workspace.workspace-shell > section.canvas-card.drawing-canvas-card.workspace-canvas > div.canvas-frame > svg`. It participates in grid layout, min/max sizing, `overflow:hidden`, rounded surfaces, and relative/absolute stacking. Case 15 uses `main > section > div(position:relative) > svg`. The real app also has header/workspace navigation and much more selectable text elsewhere in the document.

### 5. SVG semantics and accessibility

The real SVG has `role="img"`, a dynamic `aria-label`, a React ref, dynamic `viewBox`, and several labelled groups. It has no `tabindex`, `draggable`, explicit `focusable`, or `aria-hidden`; the clean SVG has none of the role/ref/group labels, but it does share `viewBox`. No repository CSS assigns selection behavior based on `role` or ARIA. These remain real but lower-ranked deltas.

### 6. Two SVGs stacked over the same frame

The real Drawing uses one model-coordinate SVG plus a screen-coordinate overlay SVG. The overlay is absolute and pointer-transparent and contains live SVG text, a circle, and possibly a cursor group with transforms. Case 15 has one SVG. This is a substantially different SVG/selection boundary even though direct hit testing reaches the underlying SVG.

### 7. Dynamic geometry, transforms, and rerendering

Committed lines, preview lines, cursor/inference content, a dynamically resized viewBox, `ResizeObserver`, `getScreenCTM()`, and translated cursor groups exist only in real Drawing. The clean results show that line/path/circle/group structure alone is insufficient. Their remaining relevance is therefore only in combination with state changes or selection boundaries.

### 8. CSS deltas

Real Drawing has:

- `.cad-viewport-interaction { overscroll-behavior: contain; }`;
- cursor changes (`crosshair` for Line, grabbing during pan in other shared rules);
- full-size/block SVG layout inherited from `.design-svg` and canvas styles;
- `pointer-events:none` on grid planes, axes, committed/preview lines, overlay, status, and cursor-like visuals;
- absolute positioning and z-index for overlay/status/controls;
- `overflow:hidden` on canvas containers;
- non-scaling strokes.

No relevant `touch-action`, `contain`, `isolation`, or explicit `transform` is applied to the Drawing viewport/ancestors in the inspected rules. `touch-action:none` appears elsewhere in the stylesheet, not on this Drawing canvas. No production `user-select` rule applies to `.cad-viewport-interaction` or the canvas frame.

### 9. Event types specifically absent/present

| Event | Clean Case 15 | Real Drawing production | Diagnostic-only |
|---|---|---|---|
| `pointerdown` / `move` / `up` / `cancel` / `leave` | none | React handlers | capture recorder when enabled |
| `mousedown` / `mouseup` | none | no canvas handler | capture recorder only |
| `click` | none | no canvas handler | capture recorder only |
| `dblclick` | none | React Line-finish handler, no cancellation | capture recorder only |
| `contextmenu` | none | React cancellation | not in current canvas diagnostic list |
| `wheel` | none | native non-passive cancellation + propagation stop | no |
| `selectionstart` | none | no canvas cancellation | capture recorder only |
| `selectionchange` | none | no production behavior | document recorder only |
| `dragstart` | none | none | none in current canvas diagnostics |

No current evidence makes `tabindex`, `draggable`, pseudo-elements, `touch-action`, or a canvas `selectionstart` handler a delta; they are absent in both relevant surfaces.

## 4. MICROSOFT EDGE OFFICIAL RESEARCH

### Officially documented behavior

Microsoft's policy catalog names **QuickSearchShowMiniMenu** “Enable quick search in Microsoft Edge mini menu.” The documented policy controls whether the mini menu is available when users select text and describes the user-facing setting. This supports selection as the intended trigger and browser/profile policy as the supported control plane.

Microsoft support material calls the feature a mini menu available on text selection and places its toggle under `Settings > Appearance > Context menus` (wording and exact location can vary with Edge version). Microsoft also documents Copilot/contextual capabilities separately, which is why an icon-only screenshot is required before calling every vertical Edge popup the classic mini menu.

### Answers to the six Edge questions

1. **Trigger:** official mini-menu material describes selection of text as the trigger. It does not document “double-click any SVG empty area” as a trigger.
2. **Per-element/site disable API:** no supported Edge-specific HTML, CSS, JavaScript, permission policy, or meta tag is documented. The documented controls are a user setting and enterprise policy.
3. **Is CSS `user-select` documented as sufficient?** No. CSS `user-select` controls whether the user can select text; Microsoft does not document it as an Edge mini-menu API or guarantee. It may prevent the prerequisite in ordinary cases, which is an inference, not an Edge contract.
4. **Is `preventDefault()` on `mousedown`/`dblclick` documented?** No Edge document identified here promises that either event cancels the browser chrome. The DOM/UI Events platform does make cancellation relevant to native selection defaults, but applying it to Edge chrome is incidental unless validated in the target Edge version.
5. **Browser chrome:** yes. The menu/settings/policy are Edge UI. A page can sometimes avoid producing its trigger but cannot directly render, close, or configure Edge chrome through a supported web API.
6. **Known SVG-specific behavior:** no official Edge documentation identified here declares an SVG-specific mini-menu trigger or fix. SVG text is selectable platform content; the clean result is consistent with that general behavior, not proof of a special SVG bug.

### Diagnostic browser setting (not a product fix)

For a controlled identification test only, open Edge settings, search for **mini menu**, then temporarily turn off **Show mini menu when selecting text** (normally under **Appearance > Context menus**). Repeat the unchanged real Drawing gesture, then restore the setting. In managed installations, `edge://policy` may show `QuickSearchShowMiniMenu`; enterprise policy should not be changed for this test.

- If the popup disappears, the UI is strongly identified as the text-selection mini menu or a feature governed by the same switch.
- If it remains, the likely feature is Copilot contextual actions or another Edge surface, not the classic mini menu governed by that setting.

This is identification evidence only and must not become a user requirement.

## 5. GITHUB / PRIOR ART

Live GitHub search was unavailable in this environment. The table records stable upstream source/issue locations and well-established implementation categories; links and current line numbers require connected verification before a code decision.

| Project | Issue/source | Symptom/context | Approach/category | Relevance |
|---|---|---|---|---|
| Chromium | [selection component](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/editing/selection/) | Blink owns selection mechanics used by Edge | Browser implementation / **F** | Strong for event-selection mechanics; it does not document Edge's proprietary menu. |
| Microsoft Edge policy templates | [QuickSearchShowMiniMenu policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/quicksearchshowminimenu) | Text-selection mini menu governance | Browser policy/user setting / **A** | Strong for feature trigger/control plane; not a site fix. |
| XYFlow / React Flow | [system styles](https://github.com/xyflow/xyflow/blob/main/packages/system/src/styles/init.css), [Pane source](https://github.com/xyflow/xyflow/tree/main/packages/react/src/container/Pane) | Prevent accidental selection and centralize SVG pane gestures | CSS plus centralized event handling / **B/C** | Closest mature React/SVG graph-editor analogue, but no Edge-specific guarantee. |
| SVG-Edit | [editor source](https://github.com/SVG-Edit/svgedit) | SVG selection/move/draw modes must coexist with text editing | Root SVG/editor event controller; text editing is a separate mode / **B/C/E** | Strong architectural analogue; source verification is required for exact current handlers. |
| diagrams.net / mxGraph | [mxGraph JavaScript source](https://github.com/jgraph/mxgraph/tree/master/javascript/src/js) | SVG/HTML graph surface should not invoke native selection during graph gestures | Prefixed `userSelect:none`, central mouse listeners, explicit editing paths / **B/C/E** | Mature mixed SVG/HTML precedent; legacy framework implementation must not be copied verbatim. |
| Excalidraw | [application styles](https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw), [Canvas source](https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw) | Canvas gestures versus browser text selection | Canvas root selection suppression; editable text handled through HTML input/textarea / **B/E** | Supports separation of surface and text editing, but raster canvas differs materially from SVG. |
| tldraw | [editor source](https://github.com/tldraw/tldraw/tree/main/packages/editor) | Full-screen canvas/editor interactions | Root interaction contract, `touch-action`/overscroll/selection management; text editor separately enabled / **B/C/E** | Mature pattern, but DOM/canvas hybrid and extensive gesture system are too broad for a popup patch. |
| Fabric.js | [Canvas DOM manager](https://github.com/fabricjs/fabric.js/tree/master/src/canvas) | Lower/upper HTML canvases should not be natively selected | Canvas DOM event ownership and selection suppression / **B/C/E** | Useful Canvas precedent only; does not establish SVG behavior. |
| Konva | [Stage source](https://github.com/konvajs/konva/blob/master/src/Stage.ts) | Canvas stage should own drag/select gestures | Stage content styles disable native selection; editable text commonly uses external textarea / **B/E** | Again demonstrates surface/editor separation, not an Edge-specific SVG solution. |
| JointJS | [Paper API/source](https://github.com/clientIO/joint/tree/master/packages/joint-core/src/dia) | SVG paper centralizes pointer/double-click events and element hit testing | Paper/root events, interactive flags, separate content-edit UI / **C/E** | Strong SVG architecture analogue; commercial/current branches need connected verification. |

No high-quality upstream issue was found in the available evidence that exactly matches “Edge vertical popup on a double-clicked empty SVG workspace without selected text.” That absence is important: common selection suppression is prior art, but it is not proof that our symptom has the same cause.

## 6. MATURE EDITOR PATTERNS

| Editor | Surface | Dominant interaction pattern | Geometry pointer-active? | Editable text |
|---|---|---|---|---|
| SVG-Edit | SVG | Central mode/controller on the SVG canvas; browser selection generally suppressed during drawing/select modes | Yes, selection requires hit-testable SVG objects/handles | Dedicated text mode restores text-specific behavior |
| React Flow / XYFlow | SVG pane plus HTML node overlays | Root Pane centralizes pointer/click/context/scroll behavior; CSS prevents native selection on graph objects | Yes; nodes/edges remain interactive instead of globally using `pointer-events:none` | Node content can opt into input/content controls; no blanket disabling of all descendants |
| diagrams.net / mxGraph | SVG in modern browsers with HTML overlays | Graph container owns mouse gestures; prefixed `userSelect` suppression is applied around graph interaction | Yes | Cell-label editing uses a dedicated editor/input path |
| Excalidraw | HTML canvas plus HTML UI | Canvas/editor root disables native selection; application selection is model state | Canvas hit testing is application-controlled | Temporary textarea/input overlay |
| tldraw | Canvas/DOM hybrid | A root editor contract coordinates pointer, touch, keyboard, focus, and native selection | Application-controlled | Explicit text-edit state/component |
| Fabric.js | Two stacked canvases | Canvas manager centralizes browser events; native DOM selection is irrelevant/suppressed | Canvas objects are application hit-tested | External DOM text editor pattern |
| Konva | Canvas scene graph | Stage owns events and applies non-selection styling to its content | Canvas shapes are application hit-tested | External textarea for editing examples |
| JointJS | SVG Paper | Central paper dispatch with element/blank events and mode-specific interaction | Yes | Separate element/tool/editor behavior |

### Dominant code-search pattern

Across mature editors, the dominant pattern is not an Edge-specific `dblclick` patch. It is:

1. define an interaction boundary at the editor/paper/stage root;
2. prevent native selection on the non-text editing surface (often CSS, sometimes event cancellation);
3. keep geometry hit-testable when object selection needs it;
4. centralize gesture dispatch rather than attach unrelated cancellation layers to individual tools;
5. explicitly opt editable text controls back into native focus/selection behavior;
6. use `preventDefault()` for a specific owned gesture/default, not as a general browser-chrome API;
7. Canvas projects frequently use broad suppression because their scene has no DOM text; that does **not** transfer automatically to an SVG editor with accessible/editable SVG text.

`pointer-events:none` is mainly used for decorative overlays, previews, cursor visuals, or noninteractive geometry—not as the standard way to prevent native text selection across an editor. `draggable={false}` targets HTML drag behavior and is not a dominant solution to selection mini menus. `selectionstart` cancellation exists in older/mixed graph stacks, but modern projects more often express nonselection through root CSS plus an explicit text-editing exception.

## 7. WHAT THE POPUP ACTUALLY IS

### Identification

**Current identification: HIGH-CONFIDENCE Edge contextual browser chrome; only MEDIUM confidence that it is specifically the classic Edge Mini Menu.**

Reasons for the higher-level identification:

- the user reports Edge chrome icons rather than application DOM;
- direct selection of SVG `100` triggers it;
- nearby DOM words were observed selected during contaminated runs;
- the behavior is Edge-specific in the supplied facts.

Reasons not to claim definitive Mini Menu identity:

- no screenshot is stored in the repository for icon-by-icon comparison;
- current Edge builds can expose classic mini menu, Copilot/contextual actions, sidebar actions, and visual search surfaces;
- Visual Search is primarily documented for images and therefore maps poorly to an empty SVG region;
- Web Select historically concerns selecting/copying structured web content and does not best match an icon strip after double-click;
- the classic Mini Menu is documented around selected text, while the real Drawing appears empty and the clean selection A/B did not reproduce.

The safest label until the settings diagnostic is run is **“Edge selection/contextual-actions chrome.”** Calling it “Visual Search” has low support. Calling it definitively “Copilot” or definitively “Mini Menu” exceeds the evidence.

## 8. PREVIOUS FALSE LEADS

1. **Line lifecycle was blamed too early.** Select reproduces the popup, so `finishLine()`, delayed line commit, and persistent Line mode are not necessary.
2. **The native `dblclick` handler was over-weighted.** An empty SVG with that handler does not pop; on Select the same handler performs no finish action.
3. **Geometry/hit targets looked causal before the clean bisect.** Lines, paths, circles, grids, axes, solid rects, and pointer-transparent variants all fail to reproduce. Geometry remains a contextual delta but is disproved as a sufficient cause.
4. **Diagnostic text contaminated selection evidence.** Readouts containing `Last`, labels containing `Canvas`, and nearby `Fit` controls introduced exactly the kind of selectable text associated with Edge's documented mini-menu trigger.
5. **`user-select:none` was treated as a leading fix before its prerequisite was reproduced.** The later A/B produced no popup in either arm. It neither validates nor conclusively refutes real-viewport suppression, but it cannot justify promotion.
6. **Tool-rail success criteria drifted away from the reported location.** C1–C4 layered mechanisms on buttons; the current reproducible symptom is an empty canvas double-click.
7. **Pointer transparency was conflated with selection prevention.** `pointer-events:none` changes event targeting; it is not a Selection API contract. The clean comparisons also show no popup distinction.
8. **Comments were stronger than evidence.** The production comment saying pointer cancellation occurs “before Edge can synthesize” a native mouse/dblclick selection sequence states a causal chain that real-Edge evidence never proved.

The reset is: browser chrome is observed; text selection is correlated in some cases; direct SVG text proves a valid trigger; the real empty-area trigger remains unknown.

## 9. CANDIDATE SOLUTIONS

These are solution **families for later validation**, not recommendations to implement now.

### 1. Local CAD viewport native-selection suppression

- **Our evidence:** selectable application text surrounds/overlays the real SVG, and direct SVG text selection triggers the popup. No production suppression currently applies to the viewport. Counter-evidence: the clean local `user-select:none` A/B did not reproduce in either arm.
- **Edge evidence:** selected text is the documented Mini Menu trigger, but Edge does not guarantee `user-select` as a mini-menu control.
- **Prior art:** root/paper/stage nonselection is common in mature editors, with explicit text-edit exceptions.
- **Risks:** hides useful native selection/accessibility if applied too broadly; may do nothing if the popup is not selection-driven; adds a fifth suppression layer if bolted onto existing tool code.
- **Scope/reversibility:** one root rule in a later isolated experiment; small and reversible.
- **Confidence:** **MEDIUM-LOW**.

### 2. Cancel the native default only at the real canvas's primary `mousedown`

- **Our evidence:** real canvas currently leaves primary mouse default untouched; clean cases lack the real interaction context. Tool-rail mousedown cancellation exists but was never tested as the only mechanism on the failing surface.
- **Edge evidence:** no official Edge guarantee. Platform selection commonly starts from mouse defaults, making this a causal probe rather than a documented fix.
- **Prior art:** editor roots often cancel default for owned non-text drawing gestures.
- **Risks:** can affect focus, drag initiation, accessibility, compatibility mouse behavior, and future SVG text editing; duplicates pointer/mouse layering if retained blindly.
- **Scope/reversibility:** one capture listener/React handler, one `preventDefault`, real Drawing only; very small and fully reversible.
- **Confidence:** **MEDIUM** as an experiment, **LOW-MEDIUM** as a solution before evidence.

### 3. A deliberate root-canvas interaction contract with text-edit opt-in

- **Our evidence:** current behavior is split among SVG React handlers, native wheel capture, shared pan hooks, tool-rail suppression, and development diagnostics. Layering risk is real.
- **Edge evidence:** none specific; this is application architecture rather than Edge control.
- **Prior art:** strongest cross-editor pattern, especially SVG paper/graph editors.
- **Risks:** broad refactor forbidden in the next step; could change Drawing, Box, and shared CAD behavior; disproportionate before root cause.
- **Scope/reversibility:** medium/large and less reversible.
- **Confidence:** **HIGH** as long-term hygiene, **LOW** as the immediate popup answer.

### 4. Remove/relocate selectable canvas chrome while preserving semantics

- **Our evidence:** nearby status/control/diagnostic text is the largest DOM delta and has actually appeared in selection snapshots. The label overlay text itself is already nonselectable.
- **Edge evidence:** consistent with a selected-text trigger.
- **Prior art:** editors separate canvas chrome and editable text, but retain accessible controls rather than making everything pointer-transparent.
- **Risks:** UI/accessibility regression; historical observations may be diagnostic contamination; clean pages with nearby text still did not reliably pop.
- **Scope/reversibility:** small-to-medium depending on whether only diagnostics or production status is involved.
- **Confidence:** **LOW-MEDIUM**.

### 5. Browser limitation/no reliable site-level suppression

- **Our evidence:** no minimal web trigger has reproduced, and the UI is browser-owned.
- **Edge evidence:** supported controls are user/enterprise settings rather than per-site API.
- **Prior art:** no exact empty-SVG Edge case with a stable site-level API is established here.
- **Risks:** accepting this prematurely would abandon a potentially ordinary selection-default bug; requiring users to alter Edge settings is unacceptable.
- **Scope/reversibility:** zero code, but potentially poor UX.
- **Confidence:** **MEDIUM-LOW**.

## 10. RISK OF MORE LAYERING

Do **not** add canvas CSS, `dblclick.preventDefault()`, Selection API clearing, another `selectionstart` listener, or Edge detection on top of the existing tool-rail package. In particular:

- do not restore historical `pointerup`/`mouseup` cancellation;
- do not extend the tool-button `user-select` rule and call that root-cause resolution;
- do not add canvas pointer cancellation alongside mouse cancellation in the same experiment;
- do not keep focus-restoration code if the cancellation that necessitates it is later removed;
- do not change grid/geometry pointer events: the clean bisect disproves them as sufficient causes;
- do not change Line finish/lifecycle: Select disproves it as necessary;
- do not promote dev-only repro/diagnostic structures into production behavior;
- do not use browser sniffing for browser chrome that the page cannot positively identify.

Before any final fix, popup-specific production mechanisms should be treated as a package and each must earn its place through independent product behavior or a controlled real-Edge result.

## 11. EXACTLY ONE NEXT EXPERIMENT

**Experiment:** in a throwaway branch only, with every existing diagnostic mode disabled, add exactly one temporary **primary-button `mousedown` default cancellation at the real Drawing SVG root**. Do not add CSS, pointer cancellation, `dblclick` cancellation, selection clearing, focus changes, browser detection, or lifecycle changes. Test the same empty-area double-click with **Select active**, then revert the one mechanism.

Why this experiment: it changes one browser default at the earliest compatibility-mouse stage on the known-failing surface. It directly distinguishes the top two remaining hypotheses: (A) the popup depends on the native mouse selection/default pipeline in the real workspace; (B) it is triggered by broader Edge contextual processing or a condition unaffected by that default. Testing Select excludes Line lifecycle.

**If result A — popup disappears:** conclude that an uncancelled primary mouse default in the real viewport is necessary under the tested Edge version. Do **not** immediately ship it; next work must verify focus/accessibility, dragging, future SVG text editing, and whether CSS can express the same interaction contract more safely. The Edge feature is still separately identified via the settings diagnostic.

**If result B — popup remains:** conclude that `mousedown` default cancellation is not sufficient and remove it. Do not stack `pointerdown`, `dblclick`, Selection API, or CSS suppression onto it. The next investigation should identify the Edge feature from UI/settings before another web-app mechanism is tried.

This is the only next technical experiment recommended by this report.

## 12. CODE CHANGE

Production code modified:
**NO**

Diagnostic code added:
**NO**

Popup workaround added:
**NO**

The only repository change is this research report.

## 13. RESEARCH SOURCES

### Repository evidence inspected

- Commits `1c2a1ac` through `b71a42a`, including complete diffs for C1–C4 cleanup and later repro work.
- `src/app/DrawingWorkspace.tsx`
- `src/app/cadInteraction.ts`
- `src/app/useCadWheelCapture.ts`
- `src/app/drawingCanvasDiagnostics.ts`
- `src/app/cadToolActivation.ts`
- `src/EdgeToolRepro.tsx`
- `src/EdgeCanvasRepro.tsx`
- `src/EdgeSvgBisect.tsx`
- `src/styles.css`
- all related `tests/cad-tool-*`, `tests/edge-*`, `tests/drawing-canvas-*`, `tests/drawing-hit-target-*`, and `tests/cad-canvas-selection.test.mjs`
- `docs/EDGE_TOOL_POPUP_ISOLATION_AUDIT.md`

### Official/platform sources (highest priority; live re-verification blocked in this environment)

1. Microsoft Learn — [QuickSearchShowMiniMenu policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/quicksearchshowminimenu)
2. Microsoft Learn — [Microsoft Edge browser policy documentation](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies)
3. Microsoft Support — [Microsoft Edge help and learning](https://support.microsoft.com/en-us/microsoft-edge)
4. Microsoft Learn — [Microsoft Edge sidebar/Copilot administration](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-sidebar)
5. MDN — [`user-select`](https://developer.mozilla.org/en-US/docs/Web/CSS/user-select)
6. MDN — [`mousedown`](https://developer.mozilla.org/en-US/docs/Web/API/Element/mousedown_event)
7. MDN — [`dblclick`](https://developer.mozilla.org/en-US/docs/Web/API/Element/dblclick_event)
8. MDN — [`selectionstart`](https://developer.mozilla.org/en-US/docs/Web/API/Node/selectstart_event)
9. Chromium/Blink — [editing selection implementation](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/editing/selection/)

### Mature editor source locations

10. XYFlow — [system interaction styles](https://github.com/xyflow/xyflow/blob/main/packages/system/src/styles/init.css)
11. XYFlow — [React Pane](https://github.com/xyflow/xyflow/tree/main/packages/react/src/container/Pane)
12. SVG-Edit — [source repository](https://github.com/SVG-Edit/svgedit)
13. diagrams.net — [source repository](https://github.com/jgraph/drawio)
14. mxGraph — [JavaScript graph source](https://github.com/jgraph/mxgraph/tree/master/javascript/src/js)
15. Excalidraw — [editor package](https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw)
16. tldraw — [editor package](https://github.com/tldraw/tldraw/tree/main/packages/editor)
17. Fabric.js — [canvas source](https://github.com/fabricjs/fabric.js/tree/master/src/canvas)
18. Konva — [Stage source](https://github.com/konvajs/konva/blob/master/src/Stage.ts)
19. JointJS — [Paper/core source](https://github.com/clientIO/joint/tree/master/packages/joint-core/src/dia)

### Research-access record

- Official web research tool: `401 Unauthorized`.
- Direct Microsoft Learn API/page requests: `403 Forbidden`.
- GitHub API, raw content, and Git transport: `403 Forbidden`.
- Consequently, no version-sensitive claim or exact current upstream line number is treated as verified in this report. A connected reviewer should open the direct sources before authorizing implementation.

---

Root cause proven:
**NO.**

Edge feature positively identified:
**HIGH-CONFIDENCE** at the family level (Edge selection/contextual-actions chrome); not definitive for the classic Mini Menu subtype.

Existing popup-related production code is layered:
**YES.**

New code added in this task:
**NO.**

Prior-art research completed:
**NO** — repository research is complete, but live upstream verification was blocked.

Official Microsoft documentation reviewed:
**NO** — source locations and known policy semantics are recorded, but pages could not be opened in this environment.

GitHub issues/source reviewed:
**NO** — source locations and established patterns are recorded, but live GitHub access was blocked.

Exactly one next experiment recommended:
**YES.**

Safe to implement another workaround immediately:
**NO unless root cause is proven.**

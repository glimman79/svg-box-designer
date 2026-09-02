import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DIMENSION_COLORS, DIMENSION_EDITOR_BORDER_PX, DIMENSION_EDITOR_HEIGHT_PX, DIMENSION_EDITOR_HORIZONTAL_PADDING_PX, DIMENSION_EDITOR_RADIUS_PX, DIMENSION_EDITOR_TEXT_SIZE_PX, DIMENSION_EDITOR_VERTICAL_PADDING_PX, DIMENSION_TEXT_SIZE_PX, dimensionEditorWidthPixels, formatDimensionEditValue } from '../.test-build/drawing-dimension-screen-ui/drawingDimension.js';

const workspace = fs.readFileSync(new URL('../src/app/DrawingWorkspace.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

assert.deepEqual(DIMENSION_COLORS, { normal: '#2db65b', hover: '#2fb85f', active: '#137a3e' });
assert.ok(Object.values(DIMENSION_COLORS).every((color) => color !== '#000000' && color !== 'black'));
assert.match(workspace, /id=\{`dimension-arrow-\$\{state\}`\}/);
assert.match(workspace, /fill=\{color\} stroke="none"/);
assert.match(workspace, /markerStart=\{arrowMarker\} markerEnd=\{arrowMarker\}/);
assert.match(workspace, /viewBox="0 0 7 7" refX="7" refY="3\.5" orient="auto-start-reverse"/);
assert.doesNotMatch(css, /context-stroke/);
assert.equal(DIMENSION_TEXT_SIZE_PX, 10);
assert.equal(DIMENSION_EDITOR_TEXT_SIZE_PX, 17);
assert.equal(DIMENSION_EDITOR_HEIGHT_PX, 26);
assert.equal(DIMENSION_EDITOR_BORDER_PX, 1);
assert.equal(DIMENSION_EDITOR_RADIUS_PX, 3);
assert.equal(DIMENSION_EDITOR_HORIZONTAL_PADDING_PX, 4);
assert.equal(DIMENSION_EDITOR_VERTICAL_PADDING_PX, 2);
assert.equal(dimensionEditorWidthPixels('95.623'), 70);
assert.equal(dimensionEditorWidthPixels('120'), 40);
assert.equal(dimensionEditorWidthPixels('120.5'), 60);
assert.equal(dimensionEditorWidthPixels('120.125'), 80);
assert.match(workspace, /modelToOverlayPoint\(editingMiddle/);
assert.doesNotMatch(workspace, /<foreignObject x=\{middle\.x/);
assert.match(css, /border: 1px solid #137a3e/);
assert.match(css, /border-radius: 3px/);
assert.match(css, /padding: 2px 4px/);
const annotationRule = css.match(/\.drawing-dimension-value, \.drawing-dimension-error \{([^}]*)\}/)?.[1] ?? '';
const editorRule = css.match(/\.drawing-dimension-editor \{([^}]*)\}/)?.[1] ?? '';
const cssValue = (rule, property) => rule.match(new RegExp(`${property}:\\s*([^;]+)`))?.[1].trim();
assert.equal(cssValue(annotationRule, 'font-family'), 'system-ui, sans-serif', 'normal annotation font family remains controlled');
assert.equal(cssValue(annotationRule, 'font-weight'), '400', 'normal annotation weight remains unchanged');
assert.equal(cssValue(annotationRule, 'stroke-width'), '2px', 'normal annotation keeps its non-scaling 2 px paint halo');
assert.equal(cssValue(editorRule, 'font-family'), cssValue(annotationRule, 'font-family'), 'HTML input explicitly shares the SVG annotation font family');
assert.equal(cssValue(editorRule, 'font-size'), `${DIMENSION_EDITOR_TEXT_SIZE_PX}px`);
assert.equal(cssValue(editorRule, 'font-weight'), '400');
assert.equal(cssValue(editorRule, 'line-height'), '20px');
assert.equal(cssValue(editorRule, 'appearance'), 'none', 'native input appearance cannot substitute browser typography');
const annotationPaintedHeightTarget = DIMENSION_TEXT_SIZE_PX + 2 * Number.parseFloat(cssValue(annotationRule, 'stroke-width'));
const visualSizeRatio = DIMENSION_EDITOR_TEXT_SIZE_PX / annotationPaintedHeightTarget;
assert.ok(visualSizeRatio >= 1.2 && visualSizeRatio <= 1.3, `editor visual target ratio ${visualSizeRatio} is 120-130% of the painted annotation target`);
assert.match(css, /drawing-dimension-editor[^}]*color: #137a3e;/);
assert.ok(DIMENSION_EDITOR_HEIGHT_PX >= Number.parseFloat(cssValue(editorRule, 'line-height')) + 2 * DIMENSION_EDITOR_VERTICAL_PADDING_PX + 2 * DIMENSION_EDITOR_BORDER_PX, 'editor height fits the controlled line box, padding, border, text, and caret');
assert.match(workspace, /<foreignObject className="drawing-dimension-editor-frame"[^>]*width=\{editorWidth\} height=\{DIMENSION_EDITOR_HEIGHT_PX\}/, 'editor frame uses CSS-pixel overlay dimensions');
assert.match(workspace, /y=\{editorAnchor\.y - DIMENSION_EDITOR_HEIGHT_PX \+ 2\}/, 'frame growth preserves the editor baseline-side attachment');
assert.equal(formatDimensionEditValue(95.6234), '95.623');
assert.equal(formatDimensionEditValue(120), '120');
assert.equal(formatDimensionEditValue(120.125), '120.125');

// The stable callback ref runs when React mounts the editor input. It focuses and
// selects only at activation; draft renders retain the same callback identity and
// therefore preserve ordinary caret/selection behavior while the user edits.
assert.match(workspace, /const dimensionEditorInputRef = useCallback\(\(input: HTMLInputElement \| null\) => \{\s*if \(!input\) return;\s*input\.focus\(\);\s*input\.select\(\);\s*\}, \[\]\);/, 'mounted editor input is focused and fully selected');
assert.match(workspace, /<input ref=\{dimensionEditorInputRef\} className="drawing-dimension-editor" value=\{dimensionDraft\}/, 'the editor uses the stable mount callback rather than a render-driven selection effect');
assert.doesNotMatch(workspace, /autoFocus className="drawing-dimension-editor"/, 'focus and selection share the mounted-input lifecycle');
assert.match(workspace, /if \(dimension\.role === 'reference'\) return;[\s\S]*setEditingDimensionId\(dimension\.id\)/, 'reference dimensions remain non-editable');
assert.match(workspace, /event\.key === 'Escape'[\s\S]*setEditingDimensionId\(null\)/, 'Escape retains the cancel path');
assert.match(workspace, /event\.key === 'Enter'[\s\S]*solveDrawingDimensionEdit\([\s\S]*transactDocument\(\(\) => result\.document\)/, 'Enter retains the solver-backed transaction path');
console.log('Drawing Dimension screen UI checks passed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const sharedCad = fs.readFileSync('src/app/cadInteraction.ts', 'utf8');
const box = fs.readFileSync('src/App.tsx', 'utf8');
const handler = workspace.match(/const handleDrawingMouseDown = \(event: MouseEvent<SVGSVGElement>\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';
const source = ts.createSourceFile('DrawingWorkspace.tsx', workspace, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let drawingSvg = '';
const visit = (node) => {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'svg'
    && node.attributes.properties.some((attribute) => attribute.getText(source) === 'ref={svgRef}')) drawingSvg = node.getText(source);
  ts.forEachChild(node, visit);
};
visit(source);
assert.notEqual(drawingSvg, '', 'the complete root SVG event boundary must be found');

assert.match(handler, /if \(event\.button === CAD_PRIMARY_BUTTON\) event\.preventDefault\(\);/, 'primary mousedown cancels its browser default');
assert.doesNotMatch(handler, /button !==|button === [12]|stopPropagation/, 'middle and secondary mousedown remain unchanged');
assert.match(drawingSvg, /onMouseDown=\{handleDrawingMouseDown\}/, 'the real Drawing SVG owns the primary-mousedown behavior');
assert.doesNotMatch(drawingSvg, /on(?:PointerDown|PointerUp|MouseUp|Click|DoubleClick)=\{[^}]*preventDefault/, 'no other Drawing SVG event receives inline default cancellation');
assert.doesNotMatch(drawingSvg, /stopPropagation/, 'the canvas event boundary does not suppress propagation');
// Exercise the actual handler body: panel-local event isolation must not change
// which canvas buttons cancel browser defaults or stop event propagation.
assert.notEqual(handler, '', 'the canvas mousedown handler must be found');
assert.match(sharedCad, /export const CAD_PRIMARY_BUTTON = 0;/);
const handleMouseDown = vm.runInNewContext(`(event) => {${handler}}`, { CAD_PRIMARY_BUTTON: 0 });
for (const button of [0, 1, 2]) {
  let defaults = 0, propagation = 0;
  handleMouseDown({ button, preventDefault: () => defaults++, stopPropagation: () => propagation++ });
  assert.equal(defaults, button === 0 ? 1 : 0, `button ${button} default cancellation`);
  assert.equal(propagation, 0, `button ${button} keeps canvas propagation`);
}
assert.match(workspace, /onDoubleClick=\{\(\) => \{ if \(activeTool === 'profile'\) finishProfile\(\)/, 'native Drawing double-click still finishes Line');
const doubleClick = drawingSvg.match(/onDoubleClick=\{(\(\) => \{[^\n]*?\})\}/)?.[1];
assert.ok(doubleClick, 'the canvas double-click callback must be found');
for (const activeTool of ['profile', 'line', 'select']) {
  let finishes = 0;
  vm.runInNewContext(`(${doubleClick})`, { activeTool, finishProfile: () => finishes++ })();
  assert.equal(finishes, activeTool === 'profile' ? 1 : 0, `${activeTool} double-click preserves Profile completion ownership`);
}
assert.doesNotMatch(sharedCad, /handleDrawingMouseDown/, 'the behavior is not shared CAD behavior');
assert.doesNotMatch(box, /handleDrawingMouseDown/, 'Box does not receive the Drawing-local behavior');

console.log('Drawing primary-mousedown regression tests passed');

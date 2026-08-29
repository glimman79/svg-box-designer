import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const buildRoot = path.resolve('.test-build/drawing-viewport');
const { getDrawingGridHierarchy, getDrawingGridSpacing, zoomViewBoxAtPoint } = await import(
  pathToFileURL(path.join(buildRoot, 'drawingGrid.js'))
);

const initial = { x: -400, y: -300, width: 800, height: 600 };
const anchor = { x: 73.25, y: -41.75 };
let zoomed = initial;
for (let index = 0; index < 100; index += 1) zoomed = zoomViewBoxAtPoint(zoomed, 1.25, anchor);
assert.equal(zoomed.width, 4, 'zoom-in clamps at the 4 mm CAD minimum width');
assert.equal(zoomed.height, 3, 'zoom-in clamps at the aspect-compatible 3 mm minimum height');
assert.ok(zoomed.width < 40, 'zoom reaches substantially closer than the old 40 mm limit');
assert.ok([zoomed.x, zoomed.y, zoomed.width, zoomed.height].every(Number.isFinite));
assert.ok(zoomed.width > 0 && zoomed.height > 0);

const beforeXRatio = (anchor.x - initial.x) / initial.width;
const beforeYRatio = (anchor.y - initial.y) / initial.height;
const anchoredZoom = zoomViewBoxAtPoint(initial, 2.37, anchor);
assert.ok(Math.abs((anchor.x - anchoredZoom.x) / anchoredZoom.width - beforeXRatio) < 1e-12);
assert.ok(Math.abs((anchor.y - anchoredZoom.y) / anchoredZoom.height - beforeYRatio) < 1e-12);

const possibleModes = new Set([-Infinity, 0, 240, 241, 1799, 1800, Infinity, NaN].map(getDrawingGridSpacing));
assert.deepEqual(possibleModes, new Set([1, 10, 100]));
assert.deepEqual(getDrawingGridHierarchy(1), { primarySpacing: 1, majorSpacing: 10 });
assert.deepEqual(getDrawingGridHierarchy(10), { primarySpacing: 10, majorSpacing: 100 });
assert.deepEqual(getDrawingGridHierarchy(100), { primarySpacing: 100, majorSpacing: null });

const workspaceSource = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
assert.match(workspaceSource, /addEventListener\('wheel',\s*handleWheel,\s*\{ passive: false \}\)/,
  'Drawing uses a native explicitly non-passive wheel listener');
assert.match(workspaceSource, /const handleWheel = \(event: WheelEvent\)[\s\S]*?event\.preventDefault\(\)/,
  'the native wheel handler prevents browser scrolling');
assert.match(workspaceSource, /removeEventListener\('wheel',\s*handleWheel\)/, 'the native listener is cleaned up');
assert.doesNotMatch(workspaceSource, /onWheel=/, 'wheel capture does not depend on React synthetic events');
assert.doesNotMatch(workspaceSource, /gridSpacing \/ 5|drawing-minor-grid|drawing-grid-line-minor/);
assert.match(workspaceSource, /getScreenCTM\(\)/, 'D2.1e browser CTM authority remains in place');
assert.match(workspaceSource, /modelToOverlayPoint/, 'D2.1e shared transform helper remains in place');
assert.match(workspaceSource, /useLayoutEffect/, 'D2.1e layout timing remains in place');

const styles = fs.readFileSync('src/styles.css', 'utf8');
assert.match(styles, /\.drawing-svg \{ overscroll-behavior: contain; \}/, 'scroll containment is canvas-scoped');
assert.match(styles, /\.drawing-grid-line-primary \{[^}]*stroke-width: 0\.7;[^}]*opacity: 0\.8;/);
assert.match(styles, /\.drawing-grid-line-major \{[^}]*stroke-width: 1;[^}]*opacity: 0\.92;/);

console.log('D2.1f CAD viewport refinement tests passed');

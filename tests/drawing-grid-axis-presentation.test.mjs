import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const buildRoot = path.resolve('.test-build/drawing-shell');
const grid = await import(pathToFileURL(path.join(buildRoot, 'drawingGrid.js')));

const supportedModes = new Set([-Infinity, 0, 240, 241, 1799, 1800, Infinity, NaN].map(grid.getDrawingGridSpacing));
assert.deepEqual(supportedModes, new Set([1, 10, 100]));
assert.deepEqual(grid.getDrawingGridHierarchy(1), { primarySpacing: 1, majorSpacing: 10 });
assert.deepEqual(grid.getDrawingGridHierarchy(10), { primarySpacing: 10, majorSpacing: 100 });
assert.deepEqual(grid.getDrawingGridHierarchy(100), { primarySpacing: 100, majorSpacing: null });
assert.notEqual(grid.getDrawingGridHierarchy(1).majorSpacing, 5);
assert.notEqual(grid.getDrawingGridHierarchy(10).majorSpacing, 50);

const drawingSource = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
assert.equal((drawingSource.match(/aria-label="X axis"/g) ?? []).length, 1);
assert.equal((drawingSource.match(/aria-label="Y axis"/g) ?? []).length, 1);
assert.equal((drawingSource.match(/className="drawing-origin-label"/g) ?? []).length, 1);
assert.equal((drawingSource.match(/drawing-x-indicator/g) ?? []).length, 1);
assert.equal((drawingSource.match(/drawing-y-indicator/g) ?? []).length, 1);
assert.match(drawingSource, /drawing-x-coordinate" data-label-side="below"/);
assert.match(drawingSource, /drawing-y-coordinate" data-label-side="right"/);
assert.doesNotMatch(drawingSource, /gridSpacing \/ 5|drawing-minor-grid|drawing-grid-line-minor/);
assert.match(drawingSource, /<svg className="drawing-label-overlay"/);
assert.match(drawingSource, /<circle className="drawing-origin-screen"/);

const styles = fs.readFileSync('src/styles.css', 'utf8');
assert.match(styles, /\.drawing-label-overlay \{[^}]*position: absolute/);
assert.match(styles, /\.drawing-label-overlay text \{[^}]*font-size: 11px/);
assert.match(styles, /\.drawing-origin-screen \{[^}]*stroke-width: 1.5/);

console.log('D2.1d grid and axis presentation tests passed');

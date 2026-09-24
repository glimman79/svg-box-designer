import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (file) => import(pathToFileURL(path.resolve(`.test-build/drawing-dimension-tool-lifecycle/${file}.js`)));
const activation = await build('cadToolActivation');
const lifecycle = await build('drawingToolLifecycle');
const dimension = await build('drawingDimension');
const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');

const once = activation.resolveCadToolPointerActivation('dimension', 1000, { x: 20, y: 20 }, null);
const persistent = activation.resolveCadToolPointerActivation('dimension', 1250, { x: 22, y: 21 }, once.record);
assert.equal(once.activationMode, 'normal', 'single activation selects one-shot mode');
assert.equal(persistent.activationMode, 'persistent', 'second resolved activation selects persistent mode');
assert.deepEqual(lifecycle.finishDrawingConstruction(lifecycle.activateDrawingTool('dimension', 'normal')), { activeTool: 'select', activationMode: 'normal' });
assert.deepEqual(lifecycle.finishDrawingConstruction(lifecycle.activateDrawingTool('dimension', 'persistent')), { activeTool: 'dimension', activationMode: 'persistent' });
assert.match(workspace, /appendDimension\(current, committed\)[\s\S]*finishDrawingConstruction\(toolLifecycle\)/, 'a completed placement commits through the shared lifecycle');
assert.match(workspace, /nextLifecycle\.activeTool === 'dimension' \? \{ phase: 'waitingForFirstTarget' \}/, 'persistent completion immediately reacquires a reference');
assert.match(workspace, /setToolLifecycle\(activateDrawingTool\('select'\)\);[\s\S]*setDimensionTool\(\{ phase: 'inactive' \}\)/, 'Escape exits Dimension through the shared tool contract');
assert.match(workspace, /const selectTool = \(tool[\s\S]*setDimensionTool\(tool === 'dimension'/, 'Select and other tools clear Dimension transient state');
assert.match(app, /aria-pressed=\{drawingActiveTool === 'dimension'\}/, 'upper Dimension button exposes pressed state');
assert.match(app, /drawingActiveTool === 'dimension' \? ' is-active'/, 'upper Dimension button exposes shared active styling');
assert.match(css, /drawing-operation-toolbar \.toolbar-button\.is-active/, 'upper Dimension active highlight is visible');
assert.doesNotMatch(app.match(/drawing-operation-toolbar[\s\S]*?<\/div>/)?.[0] ?? '', /onDoubleClick=/, 'native dblclick is not activation authority');
assert.match(app, /detail: \{ timestamp: event\.timeStamp, x: event\.clientX, y: event\.clientY \}/, 'upper button delegates pointer sequence to the accepted resolver');

for (const [value, expected] of [[95.623, '95.623'], [120, '120'], [120.5, '120.5'], [120.125, '120.125'], [120.1255, '120.126']]) {
  assert.equal(dimension.formatDimensionEditValue(value), expected);
}
assert.match(workspace, /setDimensionDraft\(formatDimensionEditValue\(dimension\.value\)\)/, 'editor initializes synchronously from the current stored driving value');
assert.doesNotMatch(workspace, /setDimensionDraft\(dimension\.value\.toString\(\)\)/, 'editor does not bypass display precision policy');
assert.match(workspace, /if \(dimension\.role === 'reference'\) return;/, 'reference values cannot enter numeric editing');
assert.match(css, /drawing-dimension-editor[^}]*font-size: 17px;[^}]*font-weight: 400;/, 'editor exceeds the painted annotation silhouette with normal weight');
assert.match(css, /drawing-dimension-editor[^}]*color: #137a3e;/, 'editor uses the selected Dimension green');
assert.match(css, /drawing-dimension-value-hit \{ fill: transparent; pointer-events: all; \}/, 'value hit targets remain interaction-capable without imposing a separate cursor language');
assert.match(css, /is-line-target \{ cursor: default; \}[\s\S]*is-point-target \{ cursor: default; \}/, 'Line and endpoint targets keep the normal arrow');
assert.match(css, /has-dimension-cursor\.is-curve-target \{ cursor: default; \}/, 'Circle and Arc candidates use the existing Dimension pointer feedback');
assert.match(workspace, /resolvedCircles\.map[\s\S]*dimensionPreselection\?\.kind === 'curve'[\s\S]*is-dimension-preselected/, 'Circle candidates use shared Dimension geometry preselection');
assert.match(workspace, /resolvedArcs\.map[\s\S]*dimensionPreselection\?\.kind === 'curve'[\s\S]*is-dimension-preselected/, 'finite Arc candidates use shared Dimension geometry preselection');
assert.match(workspace, /if \(circular\) \{ setDimensionTool\(\{ phase: 'placementPreview'[\s\S]*setDimensionPreselection\(null\)/, 'circular acquisition clears hover feedback as placement begins');

const marker = workspace.match(/<marker key=\{state\} id=\{`dimension-arrow-\$\{state\}`\}[^>]*>/)?.[0] ?? '';
assert.match(marker, /viewBox="0 0 7 7"/);
assert.match(marker, /refX="7" refY="3\.5"/, 'marker reference is the actual arrow tip');
assert.match(marker, /orient="auto-start-reverse"/, 'one tip geometry serves both endpoints');
assert.match(css, /drawing-dimension-arrow\.is-normal path \{ fill: var\(--drawing-dimension\); \}/, 'arrow receives a browser-safe state color from the shared marker class');
assert.doesNotMatch(css, /context-stroke/, 'arrow rendering does not depend on context paint inheritance');
assert.match(css, /--drawing-dimension: #2db65b;/, 'normal green is brighter than D2.5a3');

console.log('drawing Dimension tool lifecycle and polish tests passed');

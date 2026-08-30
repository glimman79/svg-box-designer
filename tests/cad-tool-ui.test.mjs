import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
const lifecycle = await import(pathToFileURL(path.resolve('.test-build/cad-tool-ui/drawingToolLifecycle.js')));

assert.match(workspace, /className=\{`cad-tool-button\$\{activeTool === 'line' \? ' is-active' : ''\}`\} aria-pressed=\{activeTool === 'line'\}/, 'Line visual and accessible state derive from activeTool');
assert.match(workspace, /className=\{`cad-tool-button\$\{activeTool === 'select' \? ' is-active' : ''\}`\} aria-pressed=\{activeTool === 'select'\}/, 'Select visual and accessible state derive from activeTool');
assert.deepEqual(lifecycle.finishDrawingConstruction(lifecycle.activateDrawingTool('line', 'persistent')), { activeTool: 'line', activationMode: 'persistent' }, 'persistent Line remains active between chains');
assert.doesNotMatch(workspace, /is-active[^\n]*(lineInteraction|unfinished|start)/, 'active styling is independent of unfinished Line state');

assert.match(app, /className=\{`tool-button cad-tool-button\$\{activeTool === tool \? ' active' : ''\}`\}/, 'Box retains its established tool-button active class while adopting shared chrome behavior');
assert.match(css, /\.tool-button:hover,\s*\.tool-button\.active\s*\{[^}]*background:\s*#5eead4;[^}]*border-color:\s*#2dd4bf;/s, 'Box active visual treatment remains present');
assert.match(css, /\.drawing-tool-sidebar \.cad-tool-button\.is-active\s*\{[^}]*background:\s*#5eead4;[^}]*border-color:\s*#2dd4bf;/s, 'Drawing uses the filled Box active visual language');

assert.match(css, /\.cad-tool-button\s*\{[^}]*user-select:\s*none;/s, 'selection suppression is scoped to CAD tool controls');
assert.doesNotMatch(css, /(?:^|[},]\s*)(?:html|body|#root|\.app-shell)\b[^{}]*\{[^}]*user-select:\s*none;/ms, 'application text selection is not globally disabled');
assert.match(workspace, /onDoubleClick=\{\(event\) => \{ event\.preventDefault\(\); selectTool\('line', 'persistent'\); \}\}/, 'Line double-click prevents browser selection and retains persistent activation');

console.log('CAD tool UI polish tests passed');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
const lifecycle = await import(pathToFileURL(path.resolve('.test-build/cad-tool-ui-c2/drawingToolLifecycle.js')));
const rail = workspace.match(/<aside[^>]*className="drawing-tool-sidebar"[\s\S]*?<\/aside>/)?.[0] ?? '';

assert.ok(rail.indexOf('>Select</button>') < rail.indexOf('>Line</button>'), 'Drawing tool order is Select then Line');
assert.doesNotMatch(rail, />\s*Tools\s*</, 'Drawing rail has no visible Tools label');
assert.match(rail, /cad-tool-button\$\{activeTool === 'select' \? ' is-active' : ''\}/, 'Select active class remains derived from activeTool');
assert.match(rail, /cad-tool-button\$\{activeTool === 'line' \? ' is-active' : ''\}/, 'Line active class remains derived from activeTool');
assert.deepEqual(lifecycle.finishDrawingConstruction(lifecycle.activateDrawingTool('line', 'persistent')), { activeTool: 'line', activationMode: 'persistent' }, 'persistent Line remains active between chains');

assert.match(css, /\.cad-tool-button\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/s, 'CAD tool chrome has vendor-prefixed and standard non-selection CSS');
assert.match(workspace, /onMouseDownCapture=\{preventToolChromeMouseSelection\}/, 'selection default is prevented at mousedown, before click and dblclick');
assert.match(workspace, /toolSidebarRef\.current[\s\S]*?addEventListener\('selectionstart', preventToolChromeSelection\)[\s\S]*?removeEventListener\('selectionstart', preventToolChromeSelection\)/, 'native selectionstart is blocked and cleaned up within Drawing tool chrome');
assert.match(workspace, /preventToolChromeMouseSelection[\s\S]*?event\.preventDefault\(\);[\s\S]*?\.closest<HTMLButtonElement>\('\.cad-tool-button'\)\?\.focus\(\);/, 'early suppression retains explicit button focus');
assert.doesNotMatch(rail, /onDoubleClick=/, 'tool chrome no longer relies on native dblclick activation');
assert.doesNotMatch(css, /(?:^|[},]\s*)(?:html|body|#root|\.app-shell)\b[^{}]*\{[^}]*user-select:\s*none;/ms, 'global application text selection remains enabled');

assert.match(app, /className=\{`tool-button cad-tool-button\$\{activeTool === tool \? ' active' : ''\}`\}/, 'Box tool styling and state markup remain unchanged');

console.log('CAD tool UI polish C2 tests passed');

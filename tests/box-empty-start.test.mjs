import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBoxDocumentV1, initialBoxViewBox } from '../.test-build/box-empty-start/app/boxDocument.js';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const panelManager = fs.readFileSync('src/app/panelManagerModel.ts', 'utf8');
const emptyDocument = createBoxDocumentV1();

assert.equal(emptyDocument.panels.length, 0, 'a new authoritative Box document has no panels');
assert.equal(emptyDocument.edges.length, 0, 'a new authoritative Box document has no rectangle edges');
assert.equal(emptyDocument.innerMarkup, '', 'a new authoritative Box document has no phantom rendered geometry');
assert.match(panelManager, /defaultPanelManagerState[^=]*= \{ panels: \{\}/, 'empty startup has no fabricated panel selection metadata');
assert.match(app, /useState<SvgDocumentModel>\(createBoxDocumentV1\)/, 'Box initializes directly from the empty document boundary');
assert.doesNotMatch(app, /starterSvg|<rect x="70"/, 'no later startup path retains the old default rectangle');
assert.match(app, /useState<string \| null>\(null\)/, 'selection state starts empty');

const viewBoxValues = initialBoxViewBox.split(/\s+/).map(Number);
assert.equal(viewBoxValues.length, 4);
assert.ok(viewBoxValues.every(Number.isFinite), 'the empty Box fallback viewBox is finite');
assert.ok(viewBoxValues[2] > 0 && viewBoxValues[3] > 0, 'the empty Box fallback viewBox has positive dimensions');
assert.match(app, /if \(!contentBounds\) \{\s*return fallbackViewBox;\s*\}/, 'Fit uses the safe document viewBox when geometry is empty');

assert.match(app, /setSvgModel\(parsedSvg\)/, 'import replaces the empty document with parsed geometry');
assert.match(app, /createPanelManagerStateFromModel\(parsedSvg\)/, 'imported geometry still enters Panel Manager');
assert.match(app, /setPanelManager\(snapshot\.panelManager\)/, 'history restore preserves a non-empty project panel state');
assert.match(app, /useCadWheelCapture\(svgRef,/, 'Box retains shared CAD wheel capture');

console.log('B3.23 empty Box start tests passed');

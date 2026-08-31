import assert from 'node:assert/strict';
import fs from 'node:fs';

const repro = fs.readFileSync('src/EdgeCanvasRepro.tsx', 'utf8');
for (const evidence of ['Last target:', 'Last elementFromPoint:', 'Selection:', 'Composed path:', 'defaultPrevented']) assert.match(repro, new RegExp(evidence), `${evidence} is visible`);
for (const eventName of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'selectionstart', 'selectionchange']) assert.match(repro, new RegExp(eventName), `${eventName} is recorded`);
assert.match(repro, /id="C3"[\s\S]*?pointerEvents="none"/, 'line pointer-events-none comparison exists');
for (const variant of ['transparent-stroke', 'stroke-opacity', 'opacity', 'none']) assert.match(repro, new RegExp(`data-hit-line="${variant}"`), `invisible hit-line ${variant} variant exists`);
for (const shape of ['rect', 'circle', 'path']) assert.match(repro, new RegExp(`<${shape}\\b`), `${shape} direct-hit case exists`);
assert.match(repro, /id="E2"[\s\S]*?<text[^>]*pointerEvents="none"/, 'SVG text pointer-transparent comparison exists');
assert.match(repro, /data-repro-html-overlay="none"[\s\S]*?pointerEvents: 'none'/, 'HTML overlay pointer-transparent comparison exists');
assert.doesNotMatch(repro, /preventDefault|removeAllRanges|userAgent/, 'repro adds no popup suppression or browser sniffing');
console.log('Edge SVG hit-target tests passed');

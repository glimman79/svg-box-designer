import assert from 'node:assert/strict';
import fs from 'node:fs';

const repro = fs.readFileSync('src/EdgeSvgBisect.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const imports = repro.split('\n').filter((line) => line.startsWith('import ')).join('\n');

assert.match(main, /import\.meta\.env\.DEV && window\.location\.pathname === '\/edge-svg-bisect'/, 'route is development-only');
for (let id = 0; id <= 15; id += 1) assert.match(repro, new RegExp(`id: ${id},`), `Case ${id} exists`);
assert.equal((repro.match(/<section className="edge-bisect-case"/g) ?? []).length, 1, 'one shared case frame renders every case');
assert.doesNotMatch(imports, /Drawing|Box|Puzzle|geometry|cadInteraction/i, 'bisect has no production Drawing, Box, or geometry imports');
assert.doesNotMatch(repro, /preventDefault|stopPropagation|selectionstart|removeAllRanges|userSelect|userAgent/, 'bisect adds no suppression or browser sniffing');
assert.doesNotMatch(repro, /addEventListener|document\./, 'bisect adds no global diagnostics');
assert.match(repro, /id: 0, label: 'Empty SVG', content: null/, 'Case 0 has no SVG content');
assert.match(repro, /id: 1, label: 'Empty SVG \+ dblclick', content: null, countDblclick: true/, 'Case 1 has only its counter handler');
for (const id of [9, 10, 11, 12, 13, 14]) assert.match(repro, new RegExp(`id: ${id},[^\n]+direct: true`), `Case ${id} has separate direct-element result`);

console.log('Edge SVG structural bisect tests passed');

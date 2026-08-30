import assert from 'node:assert/strict';
import fs from 'node:fs';

const repro = fs.readFileSync('src/EdgeToolRepro.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const case1 = repro.match(/<h2>Case 1[^<]*<\/h2>([\s\S]*?)<\/section>/)?.[1] ?? '';

for (const label of [
  'Case 1 — Native button',
  'Case 2 — user-select none',
  'Case 3 — pointer handler',
  'Case 4 — custom double activation',
]) assert.match(repro, new RegExp(label), `${label} exists`);

assert.match(case1, /<button type="button">Line<\/button>/, 'Case 1 is a semantic native button');
assert.doesNotMatch(case1, /style=|on[A-Z]|preventDefault|userSelect/, 'Case 1 has no button CSS or event behavior');
assert.doesNotMatch(repro, /from ['"]\.\/app\/|activeTool|pointerCapture|preventDefault/, 'repro has no application CAD infrastructure or suppression');
assert.match(repro, /DOUBLE_ACTIVATION_MS = 350/);
assert.match(repro, /DOUBLE_ACTIVATION_DISTANCE_PX = 6/);
assert.match(main, /import\.meta\.env\.DEV && window\.location\.pathname === '\/edge-tool-repro'/, 'route is development-only');
assert.match(main, /import\('\.\/EdgeToolRepro'\)/, 'repro is isolated in its own development chunk');
assert.match(main, /import\('\.\/styles\.css'\)[\s\S]*import\('\.\/App'\)/, 'production CSS and app code load only outside the repro');

console.log('Edge tool repro tests passed');

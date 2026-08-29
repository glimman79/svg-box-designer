import assert from 'node:assert/strict';
import fs from 'node:fs';

const drawing = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const box = fs.readFileSync('src/App.tsx', 'utf8');
const hook = fs.readFileSync('src/app/useCadWheelCapture.ts', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');

const readRule = (className) => {
  const body = styles.match(new RegExp(`\\.${className} \\{([^}]*)\\}`))?.[1];
  assert.ok(body, `${className} rule exists`);
  return {
    stroke: body.match(/stroke:\s*(#[0-9a-f]{6})/i)?.[1],
    width: Number(body.match(/stroke-width:\s*([\d.]+)/)?.[1]),
    opacity: Number(body.match(/opacity:\s*([\d.]+)/)?.[1] ?? 1),
  };
};
const luminance = ({ stroke, opacity }) => {
  const channels = stroke.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16));
  const composited = channels.map((channel) => channel * opacity + 255 * (1 - opacity));
  return 0.2126 * composited[0] + 0.7152 * composited[1] + 0.0722 * composited[2];
};

const primary = readRule('drawing-grid-line-primary');
const major = readRule('drawing-grid-line-major');
const axis = readRule('drawing-axis');
assert.deepEqual(primary, { stroke: '#adbfce', width: 0.7, opacity: 0.8 });
assert.notEqual(primary.stroke, '#b6c6d5', 'primary is darker than the D2.1g value');
assert.deepEqual(major, { stroke: '#788ea6', width: 1, opacity: 0.92 }, 'major styling is unchanged');
assert.deepEqual(axis, { stroke: '#64748b', width: 1.4, opacity: 1 }, 'axis styling is unchanged');
assert.ok(luminance(primary) > luminance(major) && luminance(major) > luminance(axis));

assert.match(drawing, /import \{ useCadWheelCapture \} from '.\/useCadWheelCapture'/);
assert.match(drawing, /useCadWheelCapture\(svgRef,/);
assert.match(box, /import \{ useCadWheelCapture \} from '.\/app\/useCadWheelCapture'/);
assert.match(box, /useCadWheelCapture\(svgRef,/);
assert.doesNotMatch(drawing, /onWheel=/);
assert.doesNotMatch(box, /onWheel=/);
assert.match(hook, /addEventListener\('wheel', handleWheel, \{ passive: false \}\)/);
assert.match(hook, /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);/);
assert.match(hook, /return \(\) => viewport\.removeEventListener\('wheel', handleWheel\)/);
assert.doesNotMatch(hook, /Drawing|Box|Puzzle/, 'shared interaction hook is workspace-neutral');
assert.match(drawing, /design-svg cad-viewport-interaction drawing-svg/);
assert.match(box, /design-svg cad-viewport-interaction/);
assert.match(styles, /\.cad-viewport-interaction \{ overscroll-behavior: contain; \}/);

console.log('D2.1h shared CAD wheel and grid refinement tests passed');

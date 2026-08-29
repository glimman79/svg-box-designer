import assert from 'node:assert/strict';
import fs from 'node:fs';

const styles = fs.readFileSync('src/styles.css', 'utf8');

function readRule(className) {
  const rule = styles.match(new RegExp(`\\.${className} \\{([^}]*)\\}`));
  assert.ok(rule, `${className} CSS rule exists`);
  const stroke = rule[1].match(/stroke:\s*(#[0-9a-f]{6})/i)?.[1];
  const width = Number(rule[1].match(/stroke-width:\s*([\d.]+)/)?.[1]);
  const opacity = Number(rule[1].match(/opacity:\s*([\d.]+)/)?.[1] ?? 1);
  assert.ok(stroke, `${className} defines a stroke colour`);
  return { stroke, width, opacity };
}

function compositedLuminance({ stroke, opacity }) {
  const channels = stroke.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16));
  const composited = channels.map((channel) => channel * opacity + 255 * (1 - opacity));
  return 0.2126 * composited[0] + 0.7152 * composited[1] + 0.0722 * composited[2];
}

const primary = readRule('drawing-grid-line-primary');
const major = readRule('drawing-grid-line-major');
const axis = readRule('drawing-axis');

assert.deepEqual(primary, { stroke: '#adbfce', width: 0.7, opacity: 0.8 });
assert.deepEqual(major, { stroke: '#788ea6', width: 1, opacity: 0.92 });
assert.deepEqual(axis, { stroke: '#64748b', width: 1.4, opacity: 1 });
assert.ok(compositedLuminance(primary) > compositedLuminance(major), 'primary grid remains lighter than major grid');
assert.ok(compositedLuminance(major) > compositedLuminance(axis), 'major grid remains lighter than axes');

console.log('D2.1g Drawing grid contrast tests passed');

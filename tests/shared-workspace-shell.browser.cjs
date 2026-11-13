// Run with the Vite app running and Playwright installed (as for the existing CAD browser harnesses).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/';
const output = process.env.WORKSPACE_BROWSER_OUTPUT;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const nav = name => page.getByRole('navigation', { name: 'Main workspaces' }).getByRole('button', { name, exact: true });
  const drawing = () => nav('2D Drawing').click();
  const box = () => nav('Box / Construction').click();
  const undo = () => page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true });
  const redo = () => page.getByRole('button', { name: 'Redo (Ctrl+Y)', exact: true });
  const tool = name => page.getByLabel(['Dimension', 'Constraints'].includes(name) ? 'Drawing header tools' : 'Drawing tools').getByRole('button', { name, exact: true });
  const count = async selector => page.locator(selector).count();
  async function click(point) {
    const client = await page.locator('svg.drawing-svg').evaluate((s, p) => {
      const c = new DOMPoint(p.x, p.y).matrixTransform(s.getScreenCTM()); return { x: c.x, y: c.y };
    }, point);
    await page.mouse.click(client.x, client.y);
  }
  async function waitCount(selector, n) { await page.waitForFunction(({ selector, n }) => document.querySelectorAll(selector).length === n, { selector, n }); }
  const snapshot = () => page.locator('[data-sketch-line-id], [data-sketch-circle-id], [data-sketch-arc-id]').evaluateAll(es => es.map(e => e.outerHTML));
  const passed = [];
  try {
    await page.goto(url);
    await nav('2D Drawing').waitFor();
    await page.evaluate(() => { window.retainedDrawing = document.querySelector('.drawing-workspace'); window.retainedBox = document.querySelector('.workspace:not(.drawing-workspace)'); });
    const positions = async () => page.locator('.project-commands, .history-commands').evaluateAll(es => es.map(e => ({ x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y })));
    const boxPositions = await positions();
    assert.equal(await page.getByRole('button', { name: /Puzzle/ }).isDisabled(), true);
    for (const command of ['Open', 'Save']) assert.equal(await page.getByRole('button', { name: command, exact: true }).isDisabled(), true);
    await drawing();
    assert.deepEqual(await positions(), boxPositions, 'project/history placement is stable across modules');
    for (const command of ['Export', 'Clear']) assert.equal(await page.getByRole('button', { name: command, exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('Import SVG into BOX / Construction', { exact: true }).isDisabled(), true);
    assert.equal(await undo().isDisabled(), true);
    passed.push('navigation, stable command/history positions and disabled capability boundaries');

    await tool('Line').click(); await click({ x: -120, y: -70 }); await click({ x: -20, y: -70 });
    await waitCount('[data-sketch-line-id]', 1);
    await undo().click(); await waitCount('[data-sketch-line-id]', 0);
    assert.equal(await redo().isEnabled(), true);
    await box(); await page.keyboard.press('Control+z'); await page.keyboard.press('Escape');
    // Neither the hidden workspace shortcuts nor navigation may consume Drawing Redo.
    await drawing(); assert.equal(await redo().isEnabled(), true); await redo().click(); await waitCount('[data-sketch-line-id]', 1);
    const line = await snapshot();
    await box(); await page.keyboard.press('Control+z'); await page.keyboard.press('Delete'); await drawing();
    assert.deepEqual(await snapshot(), line, 'hidden Drawing does not consume BOX keyboard input');
    passed.push('Line creation, local Undo/Redo, preserved Redo and hidden keyboard isolation');

    await tool('Circle').click(); await click({ x: 60, y: -50 });
    await box(); await page.keyboard.press('Escape');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('drawing:activate-dimension')));
    await drawing(); assert.equal(await tool('Circle').getAttribute('aria-pressed'), 'true');
    await click({ x: 90, y: -50 }); await waitCount('[data-sketch-circle-id]', 1);
    await tool('Arc').click(); await click({ x: 100, y: 30 }); await click({ x: 30, y: 100 });
    await box(); await drawing(); await click({ x: 80, y: 80 }); await waitCount('[data-sketch-arc-id]', 1);
    await tool('Profile').click(); await click({ x: -140, y: 60 }); await click({ x: -80, y: 60 });
    await box(); await drawing(); await waitCount('[data-sketch-line-id]', 2);
    await click({ x: -80, y: 110 }); await waitCount('[data-sketch-line-id]', 3);
    await page.keyboard.press('Escape');
    const geometry = await snapshot();
    await tool('Constraints').click(); assert.equal(await page.getByRole('dialog', { name: 'Constraints', exact: true }).isVisible(), true);
    await box(); await page.keyboard.press('Escape'); await drawing();
    assert.equal(await page.getByRole('dialog', { name: 'Constraints', exact: true }).isVisible(), true);
    await page.getByRole('button', { name: 'Close Constraints', exact: true }).click();
    await tool('Dimension').focus(); await page.keyboard.press('Enter');
    assert.equal(await tool('Dimension').getAttribute('aria-pressed'), 'true');
    await click({ x: -70, y: -70 }); await click({ x: -70, y: -130 });
    await waitCount('.drawing-dimension-value-hit', 1);
    await page.locator('.drawing-dimension-value-hit').dblclick();
    const editor = page.getByRole('textbox', { name: 'Dimension value in millimetres', exact: true });
    await editor.fill('120');
    await box(); await page.keyboard.press('Escape'); await drawing();
    assert.equal(await editor.inputValue(), '120', 'unfinished dimension edit survives module navigation');
    await editor.press('Enter');
    assert.notDeepEqual(await snapshot(), geometry, 'accepted dimension edit updates geometry');
    await undo().click(); await undo().click();
    await waitCount('.drawing-dimension-value-hit', 0);
    await page.keyboard.press('Escape');
    assert.deepEqual(await snapshot(), geometry);
    assert.equal(await page.evaluate(() => window.retainedDrawing === document.querySelector('.drawing-workspace') && window.retainedBox === document.querySelector('.workspace:not(.drawing-workspace)')), true);
    passed.push('Circle/Arc incomplete steps, Profile continuation, Constraints, keyboard Dimension creation/edit/Undo and unfinished editor state across mounted module switches');

    // Zoom, pan and Fit remain viewport-only actions.
    const svg = page.locator('svg.drawing-svg'); const initialView = await svg.getAttribute('viewBox');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); assert.notEqual(await svg.getAttribute('viewBox'), initialView);
    const bounds = await svg.boundingBox(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down({ button: 'right' }); await page.mouse.move(bounds.x + bounds.width / 2 + 35, bounds.y + bounds.height / 2 + 20); await page.mouse.up({ button: 'right' });
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    assert.deepEqual(await snapshot(), geometry);
    passed.push('Drawing zoom, right-drag pan and canvas Fit preserve geometry');

    await box();
    await page.getByLabel('Import SVG into BOX / Construction', { exact: true }).setInputFiles({ name: 'ui1-panels.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100"><rect x="0" y="0" width="100" height="80"/><rect x="130" y="0" width="100" height="80"/></svg>') });
    await page.getByRole('dialog', { name: 'Panel Manager', exact: true }).getByRole('button', { name: 'OK', exact: true }).click();
    const overlay = page.getByLabel('Active Tool overlay');
    await overlay.getByRole('button', { name: 'Accept default thickness', exact: true }).click();
    await overlay.getByRole('button', { name: 'Apply', exact: true }).click();
    await overlay.getByRole('button', { name: 'OK', exact: true }).click();
    assert.equal(await page.getByRole('complementary', { name: 'Construction history' }).getByRole('button', { name: 'Panel Manager, opens Panel Manager panel', exact: true }).count(), 1);
    await page.getByLabel('Tool sidebar').getByRole('button', { name: 'TB', exact: true }).click();
    const edgeClient = await page.locator('.edge-hitbox').first().evaluate(e => {
      const p = new DOMPoint((+e.getAttribute('x1') + +e.getAttribute('x2')) / 2, (+e.getAttribute('y1') + +e.getAttribute('y2')) / 2).matrixTransform(e.getScreenCTM());
      return { x: p.x, y: p.y };
    });
    await page.mouse.click(edgeClient.x, edgeClient.y);
    assert.equal(await page.getByRole('button', { name: 'Export', exact: true }).isEnabled(), true);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadEvent;
    assert.match(fs.readFileSync(await download.path(), 'utf8'), /<svg/);
    assert.equal(await undo().isEnabled(), true); await undo().click(); await redo().click();
    for (const name of ['TB', 'W', 'S', 'MFG']) { await page.getByLabel('Tool sidebar').getByRole('button', { name, exact: true }).click(); assert.equal(await overlay.isVisible(), true); }
    await page.getByLabel('Canvas zoom controls', { exact: true }).getByRole('button', { name: 'Fit', exact: true }).click();
    await page.getByRole('complementary', { name: 'Construction history' }).getByRole('button', { name: 'Panel Manager, opens Panel Manager panel', exact: true }).click();
    await drawing(); assert.deepEqual(await snapshot(), geometry); await box();
    assert.equal(await overlay.getByRole('heading', { name: 'Panel Manager', exact: true }).isVisible(), true);
    const historyCount = await page.getByRole('complementary', { name: 'Construction history' }).getByRole('button').count();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('dialog', { name: 'Clear BOX / Construction?', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.getByRole('complementary', { name: 'Construction history' }).getByRole('button').count(), historyCount);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('dialog', { name: 'Clear BOX / Construction?', exact: true }).getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await page.getByRole('complementary', { name: 'Construction history' }).getByRole('button').count(), 0);
    await drawing(); assert.deepEqual(await snapshot(), geometry);
    passed.push('BOX Import/PM Apply/Finish, TB edge assignment/SVG Export, local Undo/Redo, TB/W/S/MFG availability, workflow History navigation, Fit and scoped Clear');

    for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      for (const select of [box, drawing]) {
        await select();
        const layout = await page.evaluate(() => {
          const workspace = document.querySelector('.workspace-shell:not([hidden])'), canvas = workspace.querySelector('.design-svg').getBoundingClientRect(), frame = workspace.querySelector('.canvas-frame').getBoundingClientRect();
          return { w: Math.min(canvas.right, frame.right) - Math.max(canvas.left, frame.left), h: Math.min(canvas.bottom, frame.bottom) - Math.max(canvas.top, frame.top), scrollX: document.documentElement.scrollWidth > innerWidth, scrollY: document.documentElement.scrollHeight > innerHeight, hidden: [...document.querySelectorAll('.workspace-shell[hidden]')].every(e => e.getBoundingClientRect().height === 0) };
        });
        assert.ok(layout.w > 600 && layout.h > 500, JSON.stringify({ size, layout }));
        assert.deepEqual([layout.scrollX, layout.scrollY, layout.hidden], [false, false, true]);
      }
    }
    if (output) { fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: `${output}/drawing.png` }); await box(); await page.screenshot({ path: `${output}/construction.png` }); }
    passed.push('1920×1080, 1366×768 and 1024×768 usable canvases, no document scrolling or hidden-module layout');
    assert.deepEqual(errors, []);
    console.log(passed.map(name => `PASS ${name}`).join('\n'));
    if (output) fs.writeFileSync(`${output}/results.json`, JSON.stringify({ passed, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

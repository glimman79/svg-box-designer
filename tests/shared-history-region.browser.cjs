// Real CAD/workflow input only. The long-track fixture adds DOM presentation, never project data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = process.env.UI3_BROWSER_OUTPUT;
const url = process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/';
const panels = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100"><rect width="100" height="80"/><rect x="130" width="100" height="80"/></svg>';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [], passed = [], matrix = [];
  page.on('pageerror', e => errors.push(e.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const nav = name => page.getByRole('navigation', { name: 'Main workspaces' }).getByRole('button', { name, exact: true }).click();
  const drawing = () => nav('2D Drawing');
  const box = () => nav('Box / Construction');
  const history = page.getByRole('complementary', { name: 'Construction history', exact: true });
  const track = history.locator('.workflow-history-items');
  const overlay = page.getByRole('complementary', { name: 'Active Tool overlay' });
  const boxTool = name => page.getByLabel('Tool sidebar', { exact: true }).getByRole('button', { name, exact: true });
  const undo = () => button('Undo (Ctrl+Z)');
  const redo = () => button('Redo (Ctrl+Y)');
  const capabilities = async () => [await undo().isEnabled(), await redo().isEnabled()];
  const boxSvg = page.locator('svg.design-svg:not(.drawing-svg)');
  const drawingSvg = page.locator('svg.drawing-svg');
  const geometry = () => page.locator('[data-sketch-line-id], [data-sketch-circle-id], [data-sketch-arc-id]').evaluateAll(es => es.map(e => e.outerHTML));
  const contours = () => page.locator('.final-contour-kerf-layer').innerHTML();
  async function clickDrawing(p) {
    const c = await drawingSvg.evaluate((s, p) => {
      const c = new DOMPoint(p.x, p.y).matrixTransform(s.getScreenCTM()); return { x: c.x, y: c.y };
    }, p);
    await page.mouse.click(c.x, c.y);
  }
  async function edge(index) {
    const c = await page.locator('.edge-hitbox').nth(index).evaluate(e => {
      const c = new DOMPoint((+e.getAttribute('x1') + +e.getAttribute('x2')) / 2, (+e.getAttribute('y1') + +e.getAttribute('y2')) / 2).matrixTransform(e.getScreenCTM());
      return { x: c.x, y: c.y, reachable: document.elementFromPoint(c.x, c.y) === e };
    });
    assert.equal(c.reachable, true, `edge ${index}: ${JSON.stringify(c)}`); await page.mouse.click(c.x, c.y);
  }
  async function chooseSize(size) {
    await button('Settings').click(); await page.getByRole('menuitem', { name: 'Icon size', exact: true }).click();
    await page.getByRole('menuitemradio', { name: size, exact: true }).click();
  }
  async function capture(name) {
    if (output) { fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: path.join(output, `${name}.png`) }); }
  }
  try {
    await page.goto(url); await history.waitFor();
    assert.equal(await page.locator('.workflow-history-panel').count(), 1);
    assert.equal(await history.locator('button').count(), 0);
    await page.evaluate(() => {
      window.ui3Region = document.querySelector('.shared-history-region');
      window.ui3Track = document.querySelector('.workflow-history-items');
      window.ui3Drawing = document.querySelector('.drawing-workspace');
      window.ui3Box = document.querySelector('.workspace:not(.drawing-workspace)');
    });
    await drawing();
    assert.match(await history.innerText(), /persistent operations are available/);
    assert.equal(await history.getByRole('button').count(), 0);
    assert.equal(await undo().isEnabled(), false);
    assert.equal(await redo().isEnabled(), false);
    await button('Line').click(); await clickDrawing({ x: -180, y: -90 }); await clickDrawing({ x: -80, y: -90 });
    await page.locator('[data-sketch-line-id]').waitFor({ state: 'attached' });
    await button('Circle').click(); await clickDrawing({ x: 30, y: 0 }); await clickDrawing({ x: 60, y: 0 });
    await page.locator('[data-sketch-circle-id]').waitFor({ state: 'attached' });
    await button('Select').click(); await undo().click();
    const drawingBefore = await geometry(), drawingView = await drawingSvg.getAttribute('viewBox');
    assert.deepEqual(await capabilities(), [true, true]);
    await button('Circle').click(); await clickDrawing({ x: 90, y: -50 }); // unfinished tool survives navigation
    for (let n = 0; n < 2; n++) {
      await box(); assert.deepEqual(await capabilities(), [false, false]);
      await drawing(); assert.deepEqual(await capabilities(), [true, true]);
      assert.equal(await button('Circle').getAttribute('aria-pressed'), 'true');
      assert.deepEqual(await geometry(), drawingBefore);
      assert.equal(await drawingSvg.getAttribute('viewBox'), drawingView);
      assert.equal(await history.getByRole('button').count(), 0);
    }
    await track.click(); await track.dblclick();
    assert.deepEqual(await capabilities(), [true, true]);
    assert.deepEqual(await geometry(), drawingBefore);
    await clickDrawing({ x: 120, y: -50 }); await page.locator('[data-sketch-circle-id]').waitFor({ state: 'attached' });
    await button('Select').click(); await undo().click(); await undo().click();
    assert.equal(await page.locator('[data-sketch-line-id]').count(), 0, 'only the two completed edits consumed Undo');
    assert.equal(await undo().isEnabled(), false);
    await redo().click(); await redo().click();
    console.log('PASS Drawing preservation');
    passed.push('Drawing empty state, stable navigation, preserved geometry/view/Redo/unfinished Circle and exact Undo depth');

    await box();
    await page.getByLabel('Import SVG into BOX / Construction', { exact: true }).setInputFiles({ name: 'ui3.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(panels) });
    await page.getByRole('dialog', { name: 'Panel Manager', exact: true }).getByRole('button', { name: 'OK', exact: true }).click();
    await overlay.getByRole('button', { name: 'Accept default thickness', exact: true }).click();
    await overlay.getByRole('button', { name: 'Apply', exact: true }).click();
    await overlay.getByRole('button', { name: 'OK', exact: true }).click();
    for (const [name, edges] of [['TB', [0, 4]], ['W', [2, 6]]]) {
      await boxTool(name).click(); for (const i of edges) await edge(i);
      await overlay.getByRole('button', { name: 'Apply', exact: true }).click();
      assert.equal(await page.locator('.notice:not(.inline-notice)').count(), 0);
      await overlay.getByRole('button', { name: 'OK', exact: true }).click();
      await history.getByRole('button', { name: new RegExp(`^${name} Group 1,`) }).waitFor();
    }
    const manufacturedBefore = await contours();
    const tb = history.getByRole('button', { name: /^TB Group 1,/ });
    const wall = history.getByRole('button', { name: /^W Group 1,/ });
    await undo().click(); // undo Finish W; navigation must retain this exact Redo
    const boxBefore = await contours(), boxView = await boxSvg.getAttribute('viewBox');
    await tb.click(); assert.equal(await boxTool('TB').getAttribute('class').then(s => s.includes('active')), true);
    assert.equal(await tb.getAttribute('aria-pressed'), 'true');
    await wall.focus(); await page.keyboard.press('Enter');
    assert.equal(await wall.getAttribute('aria-pressed'), 'true');
    assert.equal(await boxTool('W').getAttribute('class').then(s => s.includes('active')), true);
    const unfinishedWall = await overlay.innerText();
    for (let n = 0; n < 2; n++) {
      await drawing(); assert.equal(await history.getByRole('button').count(), 0);
      await box(); assert.equal(await redo().isEnabled(), true);
      assert.equal(await overlay.innerText(), unfinishedWall);
      assert.equal(await wall.getAttribute('aria-pressed'), 'true');
      assert.equal(await contours(), boxBefore); assert.equal(await boxSvg.getAttribute('viewBox'), boxView);
    }
    await redo().click(); assert.equal(await contours(), manufacturedBefore);
    assert.equal(await overlay.getByRole('button', { name: 'OK', exact: true }).count(), 0);
    await tb.click(); await capture('box-workflow-navigation');
    console.log('PASS BOX navigation');
    passed.push('real PM/TB/W entries, original pointer/keyboard selection, unfinished group, manufacturing output and Finish Redo retained');

    for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 768]]) {
      await page.setViewportSize({ width, height });
      for (const size of ['Small', 'Normal', 'Large']) {
        await chooseSize(size);
        for (const module of ['drawing', 'box']) {
          await (module === 'drawing' ? drawing() : box());
          const layout = await history.evaluate(e => {
            const r = e.getBoundingClientRect(), shell = document.querySelector('.workspace-shell:not([hidden])');
            const canvas = shell.querySelector('.workspace-canvas').getBoundingClientRect();
            const header = document.querySelector('.top-toolbar').getBoundingClientRect();
            const controls = [...e.querySelectorAll('button')].filter(e => e.getBoundingClientRect().width > 0);
            const s = getComputedStyle(document.documentElement);
            return {
              one: document.querySelectorAll('.workflow-history-panel').length === 1,
              shared: e === window.ui3Region && e.parentElement.matches('main.app-shell') && !e.closest('svg,.workspace-shell'),
              track: window.ui3Track === e.querySelector('.workflow-history-items'),
              owners: window.ui3Drawing === document.querySelector('.drawing-workspace') && window.ui3Box === document.querySelector('.workspace:not(.drawing-workspace)'),
              overflow: document.documentElement.scrollWidth > innerWidth,
              bottom: r.bottom, top: r.top, height: r.height, canvasHeight: canvas.height,
              canvasAbove: canvas.bottom <= r.top + 1 && canvas.top >= header.bottom - 1,
              clipped: controls.some(b => { const q = b.getBoundingClientRect(); return q.top < r.top || q.bottom > r.bottom || q.left < 0 || q.right > innerWidth; }),
              tokens: ['control-height', 'control-padding', 'gap', 'font', 'icon', 'tool-width'].map(k => s.getPropertyValue(`--ui-${k}`).trim()),
              controlHeight: controls[0]?.getBoundingClientRect().height,
            };
          });
          assert.equal(layout.one && layout.shared && layout.track && layout.owners && layout.canvasAbove, true, JSON.stringify(layout));
          assert.equal(layout.overflow || layout.clipped, false, JSON.stringify(layout));
          assert.equal(layout.bottom, height); assert.ok(layout.canvasHeight >= 600); assert.ok(layout.height <= 42);
          assert.deepEqual(layout.tokens, { Small: ['20px', '4px', '2px', '10px', '12px', '44px'], Normal: ['24px', '5px', '3px', '11px', '14px', '48px'], Large: ['28px', '7px', '4px', '12px', '16px', '52px'] }[size]);
          if (module === 'box') { assert.equal(layout.controlHeight, { Small: 20, Normal: 24, Large: 28 }[size]); assert.equal(await tb.isVisible(), true); assert.equal(await wall.isVisible(), true); await wall.click(); assert.equal(await wall.getAttribute('aria-pressed'), 'true'); }
          else assert.equal(await history.getByRole('button').count(), 0);
          matrix.push({ viewport: { width, height }, size, module, ...layout });
          if ((size === 'Normal' && width >= 1366) || (width === 1024 && size !== 'Normal')) await capture(`${module}-${width}-${size.toLowerCase()}`);
        }
      }
    }
    passed.push('18 Chromium combinations: one stable bottom row, retained owners, usable canvas, no overlap/overflow/clipping, exact sizing, usable TB/W');

    await page.setViewportSize({ width: 1366, height: 768 }); await chooseSize('Normal'); await box(); await wall.click();
    const beforeScroll = { contours: await contours(), view: await boxSvg.getAttribute('viewBox'), capabilities: await capabilities(), overlay: await overlay.innerText() };
    await page.locator('.workflow-history-content').evaluate(e => {
      for (let i = 0; i < 150; i++) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'workflow-history-item';
        b.dataset.ui3Fixture = 'true'; b.textContent = `T${i + 1}`; b.setAttribute('aria-label', `Test-only presentation ${i + 1}`); e.append(b);
      }
    });
    const rect = await track.boundingBox(); await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.wheel(900, 0); await page.waitForFunction(() => document.querySelector('.workflow-history-items').scrollLeft > 0);
    await track.focus(); const start = await track.evaluate(e => e.scrollLeft); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(start => document.querySelector('.workflow-history-items').scrollLeft > start, start);
    // Wait for native keyboard scrolling to settle before recording context.
    await page.waitForTimeout(250);
    const scroll = await track.evaluate(e => e.scrollLeft);
    assert.ok(scroll > 0); await capture('long-test-only-track');
    await drawing(); assert.equal(await history.getByRole('button').count(), 0);
    await box(); assert.equal(await track.evaluate(e => e.scrollLeft), scroll, 'BOX scroll context survives Drawing');
    assert.deepEqual({ contours: await contours(), view: await boxSvg.getAttribute('viewBox'), capabilities: await capabilities(), overlay: await overlay.innerText() }, beforeScroll);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || scrollX !== 0), false);
    await page.locator('[data-ui3-fixture]').evaluateAll(es => es.forEach(e => e.remove()));
    assert.equal(await history.getByRole('button').count(), 3);
    await drawing();
    const drawingViewBefore = await drawingSvg.getAttribute('viewBox'); const drawingGeometryBefore = await geometry(); const drawingHistoryBefore = await capabilities();
    await track.hover(); await page.mouse.wheel(600, 300); await track.click(); await track.dblclick();
    assert.equal(await drawingSvg.getAttribute('viewBox'), drawingViewBefore); assert.deepEqual(await geometry(), drawingGeometryBefore); assert.deepEqual(await capabilities(), drawingHistoryBefore);
    passed.push('test-only long track: native wheel/keyboard scrolling, retained BOX scroll context, no canvas/workflow/Undo/page changes');
    assert.deepEqual(errors, []);
    if (output) fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed, matrix, errors }, null, 2) + '\n');
    console.log(JSON.stringify({ passed, layouts: matrix.length, errors }, null, 2));
  } catch (e) { await capture('failure'); throw e; } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

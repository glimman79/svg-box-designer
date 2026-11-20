// Run against Vite. Observe the real adapter at its module boundary in this browser only.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/\/src\/main\.tsx(?:\?.*)?$/, async route => {
      const response = await route.fetch();
      await route.fulfill({response, body: await response.text() + '\nwindow.unmountDrawingTestApp = () => root.unmount();'});
    });
    await page.route(/\/src\/app\/drawingTransactionAdapter\.ts(?:\?.*)?$/, async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('original')) return route.continue();
      url.searchParams.set('original', '1');
      await route.fulfill({contentType: 'text/javascript', body: `
        import { createDrawingTransactionAdapter as create } from ${JSON.stringify(url.href)};
        const observed = new WeakMap();
        export function createDrawingTransactionAdapter(owner) {
          const adapter = create(owner);
          if (!observed.has(owner)) {
            const metrics = {accepted: [], publications: 0};
            owner.subscribe(() => metrics.publications++);
            observed.set(owner, metrics);
          }
          const metrics = window.drawingMetrics = observed.get(owner);
          return { transact(label, change) {
            const result = adapter.transact(label, change);
            if (result.outcome === 'accepted') {
              if (result.history !== owner.getHistory() || result.frame.drawingDocument !== owner.drawingDocumentRef.current
                || result.frame.box !== result.history.undo.at(-1).frame.box) throw Error('Incoherent transition');
              metrics.accepted.push(label);
            }
            return result;
          }};
        }
      `});
    });
    const button = name => page.getByRole('button', {name, exact: true});
    const svg = page.locator('svg.drawing-svg');
    const metrics = () => page.evaluate(() => window.drawingMetrics);
    const client = (x,y) => svg.evaluate((element, [x,y]) => {
      const p = new DOMPoint(x,y).matrixTransform(element.getScreenCTM());
      return {x: p.x, y: p.y};
    }, [x,y]);
    const click = async (x,y) => { const p = await client(x,y); await page.mouse.click(p.x,p.y); };
    const move = async (x,y,steps=1) => { const p = await client(x,y); await page.mouse.move(p.x,p.y,{steps}); };
    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await button('2D Drawing').click();
    await button('Line').click();
    await click(-80,-50);
    await move(20,-50,10);
    assert.deepEqual(await metrics(), {accepted: [], publications: 1});
    await click(20,-50);
    await page.locator('[data-sketch-line-id]').waitFor({state: 'attached'});
    await page.keyboard.press('Escape');

    const baseline = await metrics();
    assert.deepEqual(baseline, {accepted: ['Create Line'], publications: 2});
    await svg.evaluate(el => el.addEventListener('pointerdown', event => { window.drawingTestPointerId = event.pointerId; }));
    const startDrag = async () => {
      await move(-30,-50);
      await page.mouse.down();
      await move(-10,-20,16);
      assert.equal(await svg.evaluate(el => el.classList.contains('is-geometry-dragging')), true);
      assert.deepEqual(await metrics(), baseline, 'pointermove only updates the preview');
    };
    await startDrag();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.deepEqual(await metrics(), baseline);
    await startDrag();
    const pointer = await page.evaluate(() => window.drawingTestPointerId);
    assert.ok(await svg.evaluate((element, id) => element.hasPointerCapture(id), pointer));
    await svg.dispatchEvent('pointercancel', {pointerId: pointer, bubbles: true});
    await page.mouse.up();
    assert.deepEqual(await metrics(), baseline);
    await startDrag();
    await button('Circle').focus();
    await page.keyboard.press('Enter');
    await page.mouse.up();
    assert.deepEqual(await metrics(), baseline, 'switching tools discards the captured gesture');
    await button('Select').click();
    await startDrag();
    await move(-30,-50,8);
    await page.mouse.up();
    assert.deepEqual(await metrics(), baseline, 'a return to the starting geometry has no transition');
    await startDrag();
    await page.mouse.up();
    const moved = await metrics();
    assert.deepEqual(moved, {accepted: ['Create Line','Drag geometry'], publications: 3});

    // Interrupt a new preview by restoring global history. Its late release cannot
    // overwrite the restored Line, even if Redo returns to the same document.
    await move(-10,-20);
    await page.mouse.down();
    await move(0,0,5);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+y');
    await page.mouse.up();
    assert.deepEqual(await metrics(), {accepted: moved.accepted, publications: 5});
    await button('Box / Construction').click();
    await button('2D Drawing').click();
    assert.equal((await metrics()).publications, 7);

    await button('Dimension').focus();
    await page.keyboard.press('Enter');
    await click(-10,-20);
    await click(-10,-75);
    const value = page.locator('.drawing-dimension-value-hit');
    await value.waitFor();
    const dimension = await metrics();
    assert.deepEqual(dimension.accepted.at(-1), 'Create Dimension');
    const editor = page.getByRole('textbox', {name: 'Dimension value in millimetres'});
    await value.dblclick();
    await editor.press('Enter');
    assert.deepEqual(await metrics(), dimension, 'submitting the displayed value leaves both histories alone');
    await value.dblclick();
    await editor.fill('-1');
    await editor.press('Enter');
    assert.deepEqual(await metrics(), dimension);
    await editor.fill('120');
    await editor.press('Enter');
    assert.deepEqual((await metrics()).accepted, [...dimension.accepted, 'Edit Dimension']);
    const labelBox = await value.boundingBox();
    const label = {x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2};
    const beforePlacement = await metrics();
    await page.mouse.move(label.x, label.y);
    await page.mouse.down();
    await page.mouse.move(label.x, label.y - 25, {steps: 8});
    assert.deepEqual(await metrics(), beforePlacement);
    await page.mouse.up();
    assert.deepEqual((await metrics()).accepted, [...beforePlacement.accepted, 'Move Dimension']);

    // Arm a delayed Profile segment, then restore a global edit before its timer.
    // A double-click cannot consume our input since the two points are far apart.
    await button('Profile').click();
    await click(40,65);
    await click(95,85);
    const beforeUndo = await metrics();
    assert.deepEqual(beforeUndo.accepted, [...beforePlacement.accepted, 'Move Dimension']);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300); // Production Profile delay is 220 ms.
    const afterUndo = await metrics();
    assert.deepEqual(afterUndo.accepted, [...beforeUndo.accepted, 'Create Profile segment']);
    assert.equal(afterUndo.publications, beforeUndo.publications + 2);
    await page.keyboard.press('Control+y');
    await button('Select').click();
    const grip = await page.locator('[data-sketch-point-id]').first().evaluate(element => {
      const p = new DOMPoint(+element.getAttribute('cx'), +element.getAttribute('cy')).matrixTransform(element.getScreenCTM());
      return {x: p.x, y: p.y};
    });
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x + 20, grip.y + 10, {steps: 4});
    assert.equal(await svg.evaluate(el => el.classList.contains('is-geometry-dragging')), true);
    const beforeUnmount = await metrics();
    await page.evaluate(() => window.unmountDrawingTestApp());
    await page.mouse.up();
    assert.deepEqual(await metrics(), beforeUnmount);
    assert.deepEqual(errors, []);
    console.log('PASS mounted Drawing adapter, including gesture cancellation/unmount, global restore, delayed Profile, Dimension edit and annotation drag');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless:true, args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1366,height:768}});
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button',{name,exact:true});
    const reopen = name => page.getByRole('combobox',{name:'Reopen Sketch'}).selectOption({label:name});
    const svg = page.locator('svg.drawing-svg');
    const client = (x,y) => svg.evaluate((el,[x,y]) => {
      const p = new DOMPoint(x,y).matrixTransform(el.getScreenCTM());
      return {x:p.x,y:p.y};
    },[x,y]);
    const click = async (x,y) => { const p = await client(x,y); await page.mouse.click(p.x,p.y); };
    const enter = async name => { await button(name).focus(); await page.keyboard.press('Enter'); };
    const count = selector => page.locator(selector).count();
    const box = button('Box / Construction');
    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await button('2D Drawing').click();
    assert.ok(await page.locator('.drawing-grid-plane').first().isVisible());
    assert.equal(await count('.drawing-coordinate-plane,.drawing-label-overlay,.drawing-status,.drawing-geometry-entity'),0);
    assert.equal(await button('Line').count(),0);
    assert.equal(await page.getByLabel('Reopen Sketch').count(),0);
    await click(20,30);
    const beforeZoom = await svg.getAttribute('viewBox');
    await button('Zoom in').click();
    assert.notEqual(await svg.getAttribute('viewBox'),beforeZoom);
    await button('Fit').click();

    await enter('New Sketch');
    assert.equal(await button('Finish Sketch').evaluate(el => el === document.activeElement),true);
    assert.ok(await box.isDisabled());
    assert.equal(await box.getAttribute('title'),'Finish the active Sketch before switching to BOX.');
    assert.ok(await page.locator('.drawing-origin-screen').isVisible());
    assert.ok(await page.locator('.drawing-coordinate-label').count() > 0);
    await button('Line').click(); await click(-140,-60); await click(-40,-60);
    await page.locator('[data-sketch-line-id]').waitFor({state:'attached'});
    await button('Line').click(); await click(40,10);
    await page.keyboard.press('Escape');
    assert.equal(await button('Select').getAttribute('aria-pressed'),'true');
    assert.ok(await button('Finish Sketch').isEnabled());
    assert.equal(await count('[data-sketch-line-id]'),1);
    await click(-90,-60);
    assert.ok(await count('.is-geometry-selected') > 0);
    await page.keyboard.press('Escape');
    assert.equal(await count('.is-geometry-selected'),0);
    await enter('Dimension'); await click(-90,-60); await click(-90,-100);
    const hit = page.locator('.drawing-dimension-value-hit');
    await hit.dblclick();
    const editor = page.getByRole('textbox',{name:'Dimension value in millimetres'});
    const acceptedValue = await editor.inputValue();
    await editor.fill('999');
    await enter('Finish Sketch');
    assert.equal(await button('New Sketch').evaluate(el => el === document.activeElement),true);
    assert.equal(await count('.drawing-status,.drawing-axis,.drawing-dimension-value-hit'),0);
    assert.equal(await count('.drawing-reference-sketch line'),1);
    assert.ok(await box.isEnabled());

    await enter('New Sketch');
    const reference = page.locator('.drawing-reference-sketch line');
    const original = await reference.evaluate(el => el.outerHTML);
    assert.equal(await reference.evaluate(el => getComputedStyle(el).pointerEvents),'none');
    await click(-90,-60); await page.keyboard.press('Delete');
    const point = await client(-90,-60);
    await page.mouse.move(point.x,point.y); await page.mouse.down();
    await page.mouse.move(point.x+30,point.y+20,{steps:4}); await page.mouse.up();
    assert.equal(await reference.evaluate(el => el.outerHTML),original);
    assert.equal(await count('.is-geometry-selected,[data-sketch-point-id],.drawing-dimension-hit,.drawing-geometric-constraint-marker'),0);
    await button('Constraints').click();
    assert.equal(await page.locator('.drawing-constraints-grid button:enabled').count(),0);
    await button('Close Constraints').click();
    await button('Circle').click(); await click(60,30); await click(92,30);
    await page.locator('[data-sketch-circle-id]').waitFor();
    await button('Arc').click(); await click(30,75); await click(70,100);
    await enter('Finish Sketch');
    assert.equal(await count('.drawing-reference-sketch path'),0);
    await reopen('Sketch 1');
    await hit.dblclick();
    assert.equal(await editor.inputValue(),acceptedValue);
    await editor.press('Escape');
    assert.equal(await count('.drawing-reference-sketch circle'),1);
    assert.equal(await count('[data-sketch-circle-id]'),0);

    // Keep the physical mouse down while keyboard commands replace the active editor.
    const start = await client(-140,-60);
    await page.mouse.move(start.x,start.y); await page.mouse.down();
    await page.mouse.move(start.x+28,start.y-15,{steps:4});
    assert.ok(await svg.evaluate(el => el.hasPointerCapture(1)));
    await enter('Finish Sketch'); await enter('New Sketch');
    await page.mouse.up();
    assert.equal(await count('.drawing-geometry-entity'),0);
    assert.equal(await reference.evaluate(el => el.outerHTML),original);
    await button('Circle').click(); await click(150,100);
    await enter('Finish Sketch');
    assert.equal(await count('.drawing-reference-sketch circle'),1);

    // Deliberately deliver cancelled timeout callbacks after another editor has opened.
    await reopen('Sketch 3');
    await page.evaluate(() => {
      const schedule = window.setTimeout.bind(window);
      window.pendingSketchClicks = [];
      window.setTimeout = (fn, delay, ...args) => {
        if (delay !== 220) return schedule(fn, delay, ...args);
        window.pendingSketchClicks.push(fn);
        return schedule(fn, 60000);
      };
      window.restoreClickTimers = () => { window.setTimeout = schedule; };
    });
    await button('Profile').click(); await click(40,90); await click(100,120);
    await enter('Finish Sketch');
    assert.equal(await count('.drawing-reference-sketch line'),2);
    await reopen('Sketch 2');
    await page.evaluate(() => {
      window.pendingSketchClicks.forEach(fn => fn());
      window.restoreClickTimers();
    });
    assert.equal(await count('[data-sketch-line-id]'),0);
    assert.equal(await count('.drawing-reference-sketch line'),2);
    const fileInput = page.getByLabel('Import SVG into BOX / Construction',{exact:true});
    assert.ok(await fileInput.isDisabled());
    await fileInput.setInputFiles('tests/fixtures/construction-two-panels.svg');
    assert.equal(await page.getByRole('dialog',{name:'Panel Manager'}).count(),0);
    assert.ok(await box.isDisabled());
    await enter('Finish Sketch');

    for (const width of [1920,1366,1024]) {
      await page.setViewportSize({width,height:768});
      assert.ok(await button('New Sketch').isVisible());
      await reopen('Sketch 2');
      assert.equal(await count('[data-sketch-circle-id]'),1);
      const controls = await page.getByRole('complementary',{name:'Active Sketch',exact:true}).boundingBox();
      const status = await page.locator('.drawing-status').boundingBox();
      assert.ok(controls.x >= status.x+status.width && controls.x+controls.width <= width);
      await enter('Finish Sketch');
    }
    await box.click(); await button('Undo (Ctrl+Z)').click();
    assert.ok(await button('New Sketch').isVisible());
    assert.equal(await count('.drawing-reference-sketch'),3);
    assert.deepEqual(errors,[]);
    console.log('PASS neutral grid, keyboard context commands, isolated references, Dimension draft, Arc/Circle interruption, stale drag and desktop sizes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

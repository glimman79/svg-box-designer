// All edits, navigation and history traversal use the mounted application's controls.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const rail = page.getByLabel('Drawing tools', { exact: true });
    const history = page.getByLabel('Construction history', { exact: true });
    const entries = history.locator('[data-operation-id]');
    const ids = () => entries.evaluateAll(items => items.map(item => item.dataset.operationId));
    const entry = n => history.getByRole('button', { name: 'Sketch ' + n, exact: true });
    const inspector = page.getByRole('complementary', { name: 'Active Sketch', exact: true });
    const finish = () => inspector.getByRole('button', { name: 'Finish Sketch' }).click();
    const newSketch = () => rail.getByRole('button', { name: 'New Sketch' }).click();
    const box = button('Box / Construction');
    const undo = button('Undo (Ctrl+Z)'), redo = button('Redo (Ctrl+Y)');
    const svg = page.locator('svg.drawing-svg');
    const client = (x, y) => svg.evaluate((el, [x, y]) => {
      const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM());
      return { x: p.x, y: p.y };
    }, [x, y]);
    async function pointer(x, y, action = 'click') {
      const p = await client(x, y);
      await page.mouse[action](p.x, p.y);
    }
    const references = page.locator('.drawing-reference-sketch');
    const colors = () => references.evaluateAll(groups => groups.map(g => getComputedStyle(g.firstElementChild).stroke));
    const color = locator => locator.evaluate(el => getComputedStyle(el).stroke);
    const activeName = () => inspector.getByRole('heading').innerText();

    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await button('2D Drawing').click();
    assert.deepEqual(await ids(), []);
    assert.equal(await page.locator('.sketch-context-controls').count(), 0);

    await newSketch();
    await button('Line').click(); await pointer(-180, -60); await pointer(-80, -60);
    const line = svg.locator('[data-sketch-line-id]');
    await line.waitFor({ state: 'attached' });
    await button('Dimension').focus(); await page.keyboard.press('Enter');
    await pointer(-130, -60); await pointer(-130, -100);
    const value = svg.locator('.drawing-dimension-value-hit');
    await value.waitFor();
    await button('Select').click();
    await pointer(-130, -60, 'move');
    assert.equal(await color(line), 'rgb(6, 182, 212)', 'hover uses the established CAD cyan');
    await pointer(-130, -60); await pointer(-220, 120, 'move');
    assert.equal(await color(line), 'rgb(6, 182, 212)', 'selected Line keeps its CAD color');
    await pointer(-220, 120);
    const constrained = await color(line);
    assert.equal(constrained, 'rgb(0, 168, 62)');
    const dimensionColor = await color(svg.locator('.drawing-dimension-line').first());
    await value.dblclick();
    const field = page.getByRole('textbox', { name: 'Dimension value in millimetres' });
    assert.equal(await field.inputValue(), '100');
    await field.press('Escape');
    await finish();

    await newSketch();
    await button('Circle').click(); await pointer(60, 15); await pointer(95, 15);
    const circle = svg.locator('[data-sketch-circle-id]');
    await circle.waitFor(); await pointer(-220, 120, 'move');
    assert.equal(await color(circle), 'rgb(57, 255, 90)');
    await finish();
    await newSketch();
    await button('Arc').click();
    await pointer(-40, 100); await pointer(40, 100); await pointer(0, 60);
    await svg.locator('[data-sketch-arc-id]').waitFor(); await finish();
    const lifetimes = await ids();
    assert.deepEqual(await entries.allTextContents(), ['Sketch 1', 'Sketch 2', 'Sketch 3']);
    assert.equal(new Set(lifetimes).size, 3);
    const neutral = await colors();
    assert.equal(new Set(neutral).size, 3);
    assert.deepEqual(await entries.locator('svg').evaluateAll(icons => icons.map(i => getComputedStyle(i).stroke)), neutral);

    await undo.click(); // Arc
    await undo.click(); // creation of Sketch 3
    assert.deepEqual(await ids(), lifetimes.slice(0, 2));
    assert.ok(await redo.isEnabled());
    await entry(2).click(); assert.equal(await inspector.count(), 0);
    await entry(2).dblclick();
    assert.equal(await activeName(), 'Sketch 2');
    assert.ok(await entry(1).isDisabled());
    assert.ok(await box.isDisabled());
    assert.equal(await color(circle), 'rgb(57, 255, 90)');
    await finish(); await redo.click(); await redo.click();
    assert.deepEqual(await ids(), lifetimes);
    assert.deepEqual(await colors(), neutral);

    for (const [x, y, n] of [[-130, -60, 1], [95, 15, 2], [0, 60, 3]]) {
      await pointer(x, y, 'dblclick');
      assert.equal(await activeName(), 'Sketch ' + n);
      assert.deepEqual(await colors(), ['rgb(133, 133, 133)', 'rgb(133, 133, 133)']);
      assert.ok(await references.evaluateAll(groups => groups.every(g => getComputedStyle(g.firstElementChild).pointerEvents === 'none')));
      if (n === 1) {
        assert.equal(await color(line), constrained);
        assert.equal(await color(svg.locator('.drawing-dimension-line').first()), dimensionColor);
        await value.dblclick(); assert.equal(await field.inputValue(), '100'); await field.press('Escape');
      }
      await finish();
      assert.deepEqual(await colors(), neutral);
      assert.deepEqual(await ids(), lifetimes);
    }

    // A second owner on the same finite Line must require an explicit choice.
    await newSketch(); await button('Line').click(); await pointer(-180, -60); await pointer(-80, -60); await finish();
    await pointer(-130, -60, 'dblclick');
    const choices = page.getByRole('group', { name: 'Choose a Sketch to open' });
    assert.deepEqual(await choices.getByRole('button').allTextContents(), ['Sketch 1', 'Sketch 4']);
    assert.equal(await inspector.count(), 0);
    await choices.getByRole('button', { name: 'Sketch 4' }).click();
    assert.equal(await activeName(), 'Sketch 4'); await finish();
    await box.click();
    const allIds = await ids();
    await entry(2).dblclick(); assert.equal(await activeName(), 'Sketch 2');
    assert.deepEqual(await ids(), allIds);
    await finish(); await undo.click(); assert.equal(await box.getAttribute('aria-pressed'), 'true');
    await redo.click(); assert.equal(await inspector.count(), 0);
    await entry(3).focus(); await page.keyboard.press('Enter');
    assert.equal(await activeName(), 'Sketch 3'); await finish();

    for (const width of [1920, 1366, 1024]) {
      await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
      await rail.getByRole('combobox', { name: 'Reopen Sketch' }).selectOption(allIds[1]);
      const bounds = await inspector.boundingBox(), canvas = await page.locator('.drawing-canvas-card .canvas-frame').boundingBox(), row = await history.boundingBox();
      const tools = await rail.boundingBox();
      assert.ok(bounds.x > canvas.x + canvas.width / 2 && bounds.x + bounds.width <= width);
      assert.ok(tools.x + tools.width <= canvas.x + 1 && canvas.y + canvas.height <= row.y + 1);
      assert.ok(bounds.height < canvas.height / 4 && bounds.width <= 320);
      assert.equal(await inspector.getByRole('button').count(), 1);
      assert.equal(await inspector.getByRole('button', { name: 'Finish Sketch' }).count(), 1);
      assert.equal(await rail.getByRole('button', { name: 'New Sketch' }).count(), 0);
      assert.equal(await page.locator('.shared-history-region').count(), 1);
      await finish();
    }
    await entry(1).dblclick(); await button('Clear').click(); await button('Cancel').click();
    assert.equal(await activeName(), 'Sketch 1'); assert.deepEqual(await ids(), allIds);
    await button('Clear').click(); await button('Clear Without Saving').click();
    assert.deepEqual(await ids(), []); assert.equal(await references.count(), 0);
    assert.equal(await inspector.count(), 0); assert.ok(await undo.isDisabled() && await redo.isDisabled());

    // Exercise native overflow and Undo eviction using production create/finish commands.
    await page.evaluate(async () => {
      const frame = () => new Promise(requestAnimationFrame);
      for (let i = 0; i < 105; i++) {
        document.querySelector('.drawing-tool-sidebar [aria-label="New Sketch"]').click(); await frame();
        document.querySelector('[aria-label="Sketch actions"] button').click(); await frame();
      }
    });
    const many = await ids();
    assert.equal(many.length, 105); assert.equal(new Set(many).size, 105);
    const track = history.locator('.workflow-history-items');
    assert.ok(await track.evaluate(el => el.scrollWidth > el.clientWidth));
    await entry(105).scrollIntoViewIfNeeded(); assert.ok(await track.evaluate(el => el.scrollLeft > 0));
    for (let i = 0; i < 30; i++) await undo.click();
    assert.ok(await undo.isDisabled()); assert.deepEqual(await ids(), many.slice(0, 75));
    await entry(1).dblclick(); assert.equal(await activeName(), 'Sketch 1');
    assert.ok(await redo.isEnabled());
    assert.deepEqual(errors, []);
    console.log('PASS Sketch toolbar, inspector, three geometry owners, overlap choices, CAD colors, current History navigation, Clear, 105 Sketches and three viewport widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

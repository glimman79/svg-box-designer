// Mounted Drawing → BOX authoring, mixed Apply, and manufacturing export.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const press = name => button(name).click();
    const rail = page.getByLabel('Tool sidebar', { exact: true });
    const inspector = page.getByLabel('Active Tool overlay', { exact: true });
    const tool = name => rail.getByRole('button', { name, exact: true }).click();
    const action = name => inspector.getByRole('button', { name, exact: true }).click();
    const drawing = page.locator('.drawing-svg');
    const box = page.locator('svg.design-svg:not(.drawing-svg)');
    async function clickAt(svg, x, y) {
      const point = await svg.evaluate((el, [x, y]) => {
        const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM());
        return [p.x, p.y];
      }, [x, y]);
      await page.mouse.click(...point);
    }
    async function rectangle(x, y, width, height) {
      const corners = [[x,y], [x+width,y], [x+width,y+height], [x,y+height]];
      for (let index = 0; index < corners.length; index++) {
        await press('Line');
        await clickAt(drawing, ...corners[index]);
        await clickAt(drawing, ...corners[(index+1) % corners.length]);
      }
    }
    async function apply() {
      await action('Apply');
      assert.deepEqual(await page.locator('.notice:not(.inline-notice)').allTextContents(), []);
    }
    async function tb(id, first, second) {
      await tool('TB');
      await clickAt(box, ...first);
      await clickAt(box, ...second);
      await action(id + ' 2 edges');
      await page.locator('#compact-edge-tab-size').fill('10');
      await apply();
      await action('OK');
    }
    const contours = () => box.locator('.box-reference .final-panel-path').evaluateAll(paths => paths.map(path => path.getAttribute('d')));
    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await press('2D Drawing');
    await press('New Sketch');
    await rectangle(-105,-95,100,80);
    await rectangle(-105,15,100,80);
    await rectangle(25,15,80,80);
    await press('Finish Sketch');
    await press('Box / Construction');
    await rail.getByRole('button', { name: 'Panel Manager' }).click();
    await press('Accept default thickness');
    const thickness = inspector.locator('.pm-panel-list input');
    assert.equal(await thickness.count(), 3);
    await thickness.nth(1).fill('13');
    await thickness.nth(2).fill('15');
    await apply();
    await action('OK');
    await page.locator('.canvas-zoom-controls:visible').getByText('Fit').click();
    await tb('TB1', [-55,-15], [-55,15]);
    await tb('TB2', [-5,55], [25,55]);
    const beforeWall = await contours();
    assert.equal(beforeWall.length, 3);
    await tool('W');
    await clickAt(box, -5,-55);
    await clickAt(box, 65,15);
    await action('W1 2 edges');
    assert.equal(await page.locator('#compact-edge-tab-size').inputValue(), '9');
    await apply();
    await action('OK');
    const mixed = await contours();
    assert.equal(mixed.length, 3);
    assert.equal(mixed.filter(path => beforeWall.includes(path)).length, 1);
    assert.ok(mixed.every(path => path.endsWith('Z')));
    const download = page.waitForEvent('download');
    await press('Export');
    const exported = await download;
    assert.match(exported.suggestedFilename(), /applied/);
    const svg = readFileSync(await exported.path(), 'utf8');
    assert.deepEqual([...svg.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]), mixed);
    assert.deepEqual(errors, []);
    console.log('PASS mounted three-panel TB + TB + Wall Apply and SVG export');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

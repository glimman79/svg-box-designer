// Exercise the mounted App through the same two-panel SVG and controls as the owner browser suite.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const overlay = page.getByLabel('Active Tool overlay', { exact: true });
    const actions = overlay.getByRole('group', { name: 'Active workflow actions' });
    const button = (root, name) => root.getByRole('button', { name, exact: true });
    const tool = name => button(page.getByLabel('Tool sidebar', {exact:true}), name).click();
    const undo = button(page, 'Undo (Ctrl+Z)'), redo = button(page, 'Redo (Ctrl+Y)');
    const rows = overlay.locator('.label-list');
    const label = (id, count) => button(rows, `${id} ${count} ${count === 1 ? 'edge' : 'edges'}`);
    const notice = page.locator('.notice:not(.inline-notice)');
    const contours = () => page.locator('.final-contour-kerf-layer').innerHTML();
    const history = page.getByRole('complementary', {name:'Construction history'});
    const revisit = name => history.getByRole('button', { name: new RegExp(`^${name} Group 1,`) }).click();
    const edge = async index => {
      const point = await page.locator('.edge-hitbox').nth(index).evaluate(line => {
        const x = (+line.getAttribute('x1') + +line.getAttribute('x2')) / 2;
        const y = (+line.getAttribute('y1') + +line.getAttribute('y2')) / 2;
        const p = new DOMPoint(x, y).matrixTransform(line.getScreenCTM());
        return { x:p.x, y:p.y, reachable:document.elementFromPoint(p.x,p.y) === line };
      });
      assert.ok(point.reachable, `edge ${index} is reachable`);
      await page.mouse.click(point.x, point.y);
    };
    async function traverseFinish(prefix) {
      await button(actions,'OK').click();
      await undo.click(); await revisit(prefix);
      assert.ok(await label(prefix+'2',0).isVisible());
      assert.ok(await button(actions,'OK').isVisible());
      await redo.click();
      assert.equal(await label(prefix+'2',0).count(),0);
      assert.equal(await button(actions,'OK').count(),0);
      assert.ok(await label(prefix+'1',2).isVisible());
    }

    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await page.getByLabel('Import SVG into BOX / Construction',{exact:true}).setInputFiles('tests/fixtures/construction-two-panels.svg');
    await button(page.getByRole('dialog'), 'OK').click();
    await button(overlay,'Accept default thickness').click(); await button(actions,'Apply').click(); await button(actions,'OK').click();
    const imported = await contours();

    await tool('TB'); await undo.click();
    assert.equal(await label('TB1',0).count(),0);
    await redo.click(); assert.ok(await label('TB1',0).isVisible());
    await edge(0); await edge(4);
    assert.ok(await label('TB1',2).isVisible()); assert.ok(await label('TB2',0).isVisible());
    await undo.click(); assert.ok(await label('TB1',1).isVisible()); assert.equal(await label('TB2',0).count(),0);
    await redo.click();
    const tab = page.locator('#compact-edge-tab-size');
    await tab.fill('11'); await tab.fill('12'); await undo.click();
    assert.equal(await tab.inputValue(),'11');
    await tab.fill('11.0'); await tab.press('Tab');
    assert.ok(await redo.isEnabled()); await redo.click();
    assert.equal(await tab.inputValue(),'12');
    await traverseFinish('TB');

    await tool('W'); await edge(1); await edge(7);
    assert.ok(await label('W1',2).isVisible()); assert.ok(await label('W2',0).isVisible());
    await undo.click(); await edge(3);
    assert.match(await notice.innerText(),/two panels/);
    assert.ok(await label('W1',1).isVisible()); assert.equal(await label('W2',0).count(),0);
    assert.ok(await redo.isEnabled()); await redo.click();
    await tab.fill('13'); await undo.click();
    const role = overlay.locator('select[id$="-wall-role"]').first();
    const original = await role.inputValue();
    await role.selectOption(original === 'A' ? 'B' : 'A');
    assert.match(await notice.innerText(),/complementary/);
    assert.equal(await role.inputValue(),original); assert.ok(await redo.isEnabled());
    await redo.click(); await traverseFinish('W');

    await tool('S'); await edge(2); await edge(6);
    assert.ok(await label('S1',2).isVisible()); assert.ok(await label('S2',0).isVisible());
    await undo.click(); assert.ok(await label('S1',1).isVisible()); assert.equal(await label('S2',0).count(),0);
    await redo.click();
    await label('S1',2).click(); await edge(3);
    assert.ok(await label('S3',0).isVisible()); assert.match(await notice.innerText(),/S1 is complete/);
    await undo.click();
    assert.equal(await label('S3',0).count(),0); assert.ok(await label('S1',2).isVisible()); assert.ok(await label('S2',0).isVisible());
    await page.locator('#compact-slot-tab-size').fill('14');
    assert.equal(await redo.isEnabled(),false);
    await page.locator('#compact-slot-offset').fill('3');
    await label('S2',0).click(); assert.equal(await page.locator('#compact-slot-offset').inputValue(),'3');
    await traverseFinish('S');
    assert.equal(await contours(), imported, 'authoring and Finish preserve the previous accepted output');
    await button(actions,'Apply').click();
    assert.equal(await notice.count(),0,await notice.allTextContents());
    const mixed = await contours(); assert.match(mixed,/<path/); assert.notEqual(mixed,imported);
    const [exported] = await Promise.all([page.waitForEvent('download'), button(page,'Export').click()]);
    assert.equal(exported.suggestedFilename(),'svg-box-designer-applied.svg');
    const output = require('node:fs').readFileSync(await exported.path(),'utf8');
    assert.match(output,/<path/);
    assert.doesNotMatch(output,/svg-box-designer-labels/);

    await tool('S'); await edge(3); await edge(0); // S-B references a TB replacement.
    await undo.click(); await button(actions,'Apply').click();
    assert.match(await notice.innerText(),/one S-A edge and one S-B edge/);
    assert.equal(await contours(),mixed); assert.ok(await redo.isEnabled());
    const modules = page.getByRole('navigation',{name:'Main workspaces'});
    await button(modules,'Box / Construction').click();
    assert.ok(await redo.isEnabled()); await redo.click();
    await button(modules,'2D Drawing').click();
    await undo.click();
    assert.ok(await redo.isEnabled()); await redo.click();
    await button(modules,'Box / Construction').click();
    assert.ok(await label('S2',2).isVisible()); assert.equal(await contours(),mixed);
    await label('S2',2).click();
    const sourceRow = overlay.locator('.calculated-edge-list li').filter({has:page.getByText('edge-1',{exact:true})});
    await button(sourceRow,'Remove').click();
    assert.ok(await label('S2',1).isVisible());
    await revisit('TB'); assert.ok(await label('TB1',2).isVisible());
    await undo.click(); await tool('S'); assert.ok(await label('S2',2).isVisible());
    assert.deepEqual(errors,[]);
    console.log('PASS mounted TB/W/S start, continuation, properties, role rejection, cleanup and global traversal; mixed Apply and incomplete-S rejection; cross-module Redo');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

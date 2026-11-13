// Production UI only: no document, workflow or history state injection.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/';
const output = process.env.UI2_BROWSER_OUTPUT;
const panels = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100"><rect x="0" y="0" width="100" height="80"/><rect x="130" y="0" width="100" height="80"/></svg>';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [], passed = [];
  page.on('pageerror', e => errors.push(e.message));
  const nav = name => page.getByRole('navigation', { name: 'Main workspaces' }).getByRole('button', { name, exact: true });
  const box = () => nav('Box / Construction').click();
  const drawing = () => nav('2D Drawing').click();
  const tool = name => page.getByLabel('Tool sidebar', { exact: true }).getByRole('button', { name, exact: true });
  const overlay = page.getByLabel('Active Tool overlay', { exact: true });
  const actions = overlay.getByRole('group', { name: 'Active workflow actions', exact: true });
  const apply = () => actions.getByRole('button', { name: 'Apply', exact: true });
  const finish = label => actions.getByRole('button', { name: label, exact: true });
  const undo = () => page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true });
  const redo = () => page.getByRole('button', { name: 'Redo (Ctrl+Y)', exact: true });
  const viewport = () => page.getByLabel('Canvas zoom controls', { exact: true });
  const boxSvg = page.getByRole('img', { name: 'Imported SVG with selectable edges', exact: true });
  const contours = () => page.locator('.final-contour-kerf-layer').innerHTML();
  async function noTopActions() {
    assert.equal(await page.getByLabel('Primary actions', { exact: true }).getByRole('button', { name: /^(Fit|Apply|OK)$/ }).count(), 0);
    assert.equal(await page.getByLabel('Primary actions', { exact: true }).getByRole('button', { name: /Undo/ }).count(), 1);
    assert.equal(await page.getByLabel('Primary actions', { exact: true }).getByRole('button', { name: /Redo/ }).count(), 1);
  }
  async function importPanels(svg = panels) {
    await page.getByLabel('Import SVG into BOX / Construction', { exact: true }).setInputFiles({ name: 'ui2-panels.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
    await page.getByRole('dialog', { name: 'Panel Manager', exact: true }).getByRole('button', { name: 'OK', exact: true }).click();
  }
  async function prepare() {
    await page.goto(url); await box(); await importPanels();
    await overlay.getByRole('button', { name: 'Accept default thickness', exact: true }).click();
    await apply().click(); await finish('OK').click();
  }
  async function edge(index) {
    const client = await page.locator('.edge-hitbox').nth(index).evaluate(e => {
      const p = new DOMPoint((+e.getAttribute('x1') + +e.getAttribute('x2')) / 2, (+e.getAttribute('y1') + +e.getAttribute('y2')) / 2).matrixTransform(e.getScreenCTM());
      return { x: p.x, y: p.y, reachable: document.elementFromPoint(p.x, p.y) === e };
    });
    assert.equal(client.reachable, true, `edge ${index} remains reachable outside the inspector`);
    await page.mouse.click(client.x, client.y);
  }
  async function assertActionsVisible() {
    const geometry = await actions.evaluate(e => {
      const a = e.getBoundingClientRect(), p = e.parentElement.getBoundingClientRect();
      const buttons = [...e.querySelectorAll('button')];
      return { contained: a.top >= p.top && a.bottom <= p.bottom && a.right <= p.right,
        reachable: buttons.every(b => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b; }) };
    });
    assert.deepEqual(geometry, { contained: true, reachable: true });
  }
  try {
    await page.goto(url); await box(); await noTopActions();
    assert.equal(await actions.count(), 0, 'idle BOX has no workflow controls');
    assert.equal(await tool('TB').isDisabled(), true);
    for (const select of [box, drawing]) {
      await select(); await noTopActions();
      const scope = page.locator('.workspace-shell:not([hidden])');
      assert.equal(await scope.getByRole('button', { name: 'Fit', exact: true }).count(), 1);
      const svg = scope.locator('svg.design-svg');
      const initial = await svg.getAttribute('viewBox');
      const history = [await undo().isEnabled(), await redo().isEnabled()];
      await scope.getByRole('button', { name: 'Zoom in', exact: true }).click();
      assert.notEqual(await svg.getAttribute('viewBox'), initial);
      await scope.getByRole('button', { name: 'Fit', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.equal(await svg.getAttribute('viewBox'), initial);
      assert.deepEqual([await undo().isEnabled(), await redo().isEnabled()], history);
    }
    passed.push('top-bar absence, one canvas Fit per active module, keyboard Fit and no viewport Undo');

    await box(); await importPanels();
    assert.equal(await apply().isDisabled(), true);
    assert.equal(await finish('OK').isDisabled(), true);
    await overlay.getByRole('button', { name: 'Accept default thickness', exact: true }).click();
    assert.equal(await apply().isEnabled(), true);
    await apply().focus(); await page.keyboard.press('Enter');
    assert.equal(await apply().isDisabled(), true);
    assert.equal(await finish('OK').isEnabled(), true);
    await undo().click();
    assert.equal(await apply().isEnabled(), true);
    assert.equal(await undo().isDisabled(), true, 'keyboard Apply accepted exactly once');
    await page.getByRole('dialog', { name: 'Panel Manager', exact: true }).getByRole('button', { name: 'OK', exact: true }).click();
    await redo().click();
    await finish('OK').focus(); await page.keyboard.press('Space');
    assert.equal(await actions.count(), 0);
    await undo().click(); assert.equal(await tool('TB').isDisabled(), true, 'Finish PM adds no new Undo action');
    await page.getByRole('dialog', { name: 'Panel Manager', exact: true }).getByRole('button', { name: 'OK', exact: true }).click();
    await redo().click();
    for (const name of ['J', 'P', 'Select']) { await tool(name).click(); assert.equal(await actions.count(), 0); }
    passed.push('PM validation, keyboard Apply/Finish exactly once, existing PM Undo boundary and placeholder/Select absence');

    for (const name of ['TB', 'W', 'S']) {
      await prepare(); await tool(name).click();
      assert.equal(await apply().isDisabled(), true, `${name} has no Apply inputs yet`);
      assert.equal(await finish('OK').isEnabled(), true, 'preserve existing incomplete-group Finish availability');
      const toolState = await overlay.innerText();
      await drawing(); assert.equal(await page.getByRole('group', { name: 'Active workflow actions', exact: true }).count(), 0);
      await page.keyboard.press('Escape'); await page.keyboard.press('Enter'); await box();
      assert.equal(await overlay.innerText(), toolState, `${name} unfinished group retained`);
      assert.equal(await apply().isDisabled(), true);
      await tool('Select').click(); assert.equal(await actions.count(), 0);
      await tool(name).click(); assert.equal(await overlay.innerText(), toolState, 'tool close/reopen does not implicitly finish');
      await viewport().getByRole('button', { name: 'Fit', exact: true }).click();
      const view = await boxSvg.getAttribute('viewBox');
      await viewport().getByRole('button', { name: 'Zoom in', exact: true }).click();
      await viewport().getByRole('button', { name: 'Fit', exact: true }).click();
      assert.equal(await boxSvg.getAttribute('viewBox'), view);
      await finish('OK').focus(); await page.keyboard.press('Enter');
      assert.equal(await actions.count(), 0, 'finished controls disappear');
      await undo().click();
      assert.equal(await actions.count(), 0, 'Undo retains the existing Select tool');
      await tool(name).click();
      assert.equal(await finish('OK').isVisible(), true, 'one Undo restores group');
      await redo().click(); assert.equal(await finish('OK').count(), 0, 'one Redo finishes group');
    }
    passed.push('TB/W/S incomplete Finish, tool exit/reopen, module switch isolation and single-step Finish Undo/Redo');

    await prepare(); await tool('TB').click();
    await edge(0); await edge(4);
    assert.equal(await apply().isEnabled(), true);
    const beforeApply = await contours();
    await apply().click();
    assert.notEqual(await contours(), beforeApply, 'Apply generates geometry using the existing pipeline');
    assert.equal(await page.locator('.notice:not(.inline-notice)').count(), 0);
    const applied = await contours();
    await finish('OK').click(); assert.equal(await actions.count(), 0);
    assert.match(await page.getByRole('complementary', { name: 'Construction history', exact: true }).innerText(), /TB/);
    await undo().click(); await tool('TB').click(); assert.equal(await finish('OK').isVisible(), true);
    await redo().click(); assert.equal(await contours(), applied);
    await tool('MFG').click();
    assert.equal(await apply().count(), 1);
    assert.equal(await actions.getByRole('button', { name: /^OK$/ }).count(), 0);
    const kerf = page.locator('#manufacturing-kerf');
    await kerf.fill('0.20'); await kerf.press('Enter');
    assert.equal(await apply().isEnabled(), true);
    await apply().click();
    const manufactured = await contours(); assert.notEqual(manufactured, applied);
    await undo().click(); assert.equal(await contours(), applied, 'manufacturing retains original settings acceptance boundary');
    await redo().click(); assert.equal(await contours(), manufactured);
    await undo().click();
    await tool('Select').click(); await drawing(); await box(); await tool('MFG').click();
    assert.equal(await redo().isEnabled(), true, 'overlay/module navigation preserves Redo');
    await redo().click(); assert.equal(await contours(), manufactured);
    const panelBounds = await overlay.boundingBox();
    await page.mouse.move(400, 500); await page.mouse.down({ button: 'right' });
    await page.mouse.move(460, 530, { steps: 4 }); await page.mouse.up({ button: 'right' });
    assert.deepEqual(await overlay.boundingBox(), panelBounds, 'controls stay anchored during canvas pan');
    assert.equal(await contours(), manufactured);
    passed.push('real TB edge assignment/Apply/Finish/history, Manufacturing Apply, original Undo/Redo boundary, preserved Redo and stable popup during pan');

    for (const name of ['W', 'S']) {
      await prepare(); await tool(name).click(); await edge(0); await edge(4);
      const original = await contours();
      await apply().click();
      assert.equal(await page.locator('.notice:not(.inline-notice)').count(), 0, `${name} Apply validates the complete connection`);
      assert.notEqual(await contours(), original, `${name} Apply generates geometry`);
      await finish('OK').click();
      assert.equal(await actions.count(), 0);
      assert.match(await page.getByRole('complementary', { name: 'Construction history', exact: true }).innerText(), new RegExp(name));
    }
    passed.push('complete Wall and Slot edge assignment, geometry Apply, Finish and workflow history');

    // An incomplete geometry Apply remains enabled under the original input rule,
    // reports the original validation error and does not silently finish its group.
    await prepare(); await tool('W').click(); await edge(0);
    assert.equal(await apply().isEnabled(), true); await apply().click();
    assert.equal(await finish('OK').isVisible(), true);
    assert.ok(await page.locator('.notice:not(.inline-notice)').count() > 0);
    await undo().click(); assert.equal(await apply().isDisabled(), true, 'failed Apply creates no extra Undo entry');
    passed.push('incomplete Wall Apply preserves validation, active group and Undo boundary');

    await prepare(); await tool('TB').click();
    await drawing();
    const drawingTool = name => page.getByLabel(['Dimension', 'Constraints'].includes(name) ? 'Drawing header tools' : 'Drawing tools', { exact: true }).getByRole('button', { name, exact: true });
    const drawPoint = async point => {
      const p = await page.locator('svg.drawing-svg').evaluate((s, point) => {
        const c = new DOMPoint(point.x, point.y).matrixTransform(s.getScreenCTM()); return { x: c.x, y: c.y };
      }, point);
      await page.mouse.click(p.x, p.y);
    };
    await drawingTool('Line').click(); await drawPoint({ x: -120, y: -70 }); await drawPoint({ x: -20, y: -70 });
    await drawingTool('Circle').click(); await drawPoint({ x: 60, y: -50 }); await drawPoint({ x: 90, y: -50 });
    await drawingTool('Constraints').click();
    await box();
    for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size); await assertActionsVisible();
      await apply().evaluate(e => e.scrollIntoView());
      await finish('OK').focus();
      await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      assert.equal(await finish('OK').evaluate(e => e.matches(':focus-visible') && getComputedStyle(e).outlineStyle !== 'none'), true);
      await overlay.evaluate(e => { e.scrollTop = 0; });
      for (const [select, label] of [[box, 'construction'], [drawing, 'drawing']]) {
        await select(); await noTopActions();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
        if (output) { fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: `${output}/${label}-${size.width}x${size.height}.png` }); }
      }
      await box();
    }
    // Long PM lists cannot scroll the workflow actions out of reach.
    const rects = Array.from({ length: 30 }, (_, i) => `<rect x="${i * 12}" y="0" width="10" height="10"/>`).join('');
    await importPanels(`<svg xmlns="http://www.w3.org/2000/svg">${rects}</svg>`);
    await overlay.evaluate(e => { e.scrollTop = e.scrollHeight; }); await assertActionsVisible();
    passed.push('three desktop sizes in both modules, focus indicators, screenshot layouts and sticky actions on a long PM list');
    assert.deepEqual(errors, []);
    console.log(passed.map(name => `PASS ${name}`).join('\n'));
    if (output) fs.writeFileSync(`${output}/results.json`, JSON.stringify({ passed, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Real Chromium path through Drawing, Panel Manager, TB, History and Apply.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1366,height:768}});
    page.setDefaultTimeout(6000);
    const button = name => page.getByRole('button',{name,exact:true});
    const overlay = page.getByLabel('Active Tool overlay',{exact:true});
    const rail = page.getByLabel('Tool sidebar',{exact:true});
    const drawing = page.locator('svg.drawing-svg');
    const history = page.getByRole('complementary',{name:'Construction history',exact:true});
    const exportButton = button('Export');
    const layers = page.locator('.box-reference');
    const contours = index => layers.nth(index).locator('.final-panel-path').evaluateAll(paths =>
      paths.sort((a,b) => a.getBBox().x-b.getBBox().x).map(path => path.getAttribute('d')));
    async function point(x,y) {
      const p = await drawing.evaluate((svg,[x,y]) => {
        const p = new DOMPoint(x,y).matrixTransform(svg.getScreenCTM()); return [p.x,p.y];
      },[x,y]);
      await page.mouse.click(...p);
    }
    async function line(x1,y1,x2,y2) { await button('Line').click(); await point(x1,y1); await point(x2,y2); }
    async function rectangle(x,y) {
      await line(x,y,x+80,y); await line(x+80,y,x+80,y+50);
      await line(x+80,y+50,x,y+50); await line(x,y+50,x,y);
    }
    async function edge(index) {
      const p = await page.locator('.edge-hitbox').nth(index).evaluate(el => {
        const p = el.getPointAtLength(el.getTotalLength()/2).matrixTransform(el.getScreenCTM());
        return [p.x,p.y,document.elementFromPoint(p.x,p.y) === el,document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,200)];
      });
      assert.equal(p[2],true,`edge ${index} is reachable: ${JSON.stringify(p)}`);
      await page.mouse.click(p[0],p[1]);
    }
    const tool = name => rail.getByRole('button',{name,exact:true}).click();
    const apply = () => overlay.getByRole('button',{name:'Apply',exact:true}).click();
    const ok = () => overlay.getByRole('button',{name:'OK',exact:true}).click();
    async function approvePanels() { await button('Accept default thickness').click(); await apply(); await ok(); }
    async function authorTB(a,b) { await tool('TB'); await edge(a); await edge(b); await apply(); await ok(); }
    async function selectSketch(name) {
      await rail.getByRole('button',{name:'Panel Manager'}).click();
      await page.getByRole('combobox',{name:'Panel source'}).selectOption({label:name});
    }
    const reopen = name => page.getByRole('combobox',{name:'Reopen Sketch'}).selectOption({label:name});
    const finish = () => button('Finish Sketch').click();
    async function setDimension(value) {
      await page.locator('.drawing-dimension-value-hit').last().dblclick();
      const editor = page.getByRole('textbox',{name:'Dimension value in millimetres'});
      await editor.fill(value); await editor.press('Enter');
    }
    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await button('2D Drawing').click(); await button('New Sketch').click();
    await rectangle(-180,-80); await rectangle(-55,-80); await rectangle(70,-80);
    await finish();
    await button('New Sketch').click();
    await rectangle(-180,25); await rectangle(-55,25);
    await finish(); await button('Box / Construction').click();
    await rail.getByRole('button',{name:'Panel Manager'}).click();
    await approvePanels();
    const zoom = page.locator('.canvas-zoom-controls:visible');
    await zoom.getByRole('button',{name:'Fit'}).click();
    await zoom.getByRole('button',{name:'Zoom out'}).click();
    await zoom.getByRole('button',{name:'Zoom out'}).click();
    await authorTB(2,6);
    const firstGroup = await contours(0);
    await authorTB(4,10);
    const valid = await contours(0);
    assert.equal(valid.length,3);
    assert.notEqual(valid[1],firstGroup[1]);
    const group1 = history.getByRole('button',{name:'TB Group 1 (Sketch 1)',exact:true});
    const group2 = history.locator('button[data-operation-id]').filter({hasText:'TB Group 2 (Sketch 1)'});
    const historyIds = () => history.locator('button[data-operation-id]').evaluateAll(rows => rows.map(row=>row.dataset.operationId));
    assert.equal(await group2.locator('.history-diagnostic-marker').count(),0);

    await selectSketch('Sketch 2'); await approvePanels(); await authorTB(2,6);
    const independent = await contours(1);
    const groupIds = await historyIds();
    await selectSketch('Sketch 1');

    await button('2D Drawing').click();
    await reopen('Sketch 1');
    await button('Dimension').click(); await point(110,-30); await point(110,-55);
    await setDimension('95');
    await finish(); await button('Box / Construction').click();
    assert.equal(await group1.locator('.history-diagnostic-marker').count(),0);
    assert.equal(await group2.locator('.history-diagnostic-marker').count(),1);
    assert.match(await group2.getAttribute('title'),/TB_EDGE_LENGTH_MISMATCH.*mm/);
    assert.equal(await exportButton.isDisabled(),true);
    const partial = await contours(0);
    assert.deepEqual(partial.slice(0,2),firstGroup.slice(0,2));
    assert.notEqual(partial[2],valid[2]);
    await group2.click();
    assert.match(await history.locator('.history-diagnostic-detail').innerText(),/TB_EDGE_LENGTH_MISMATCH/);
    await apply();
    assert.match(await page.locator('.notice:not(.inline-notice)').innerText(),/incompatible source edge lengths/);
    assert.equal(await group2.locator('.history-diagnostic-marker').count(),1);
    assert.deepEqual(await contours(0),partial);

    await selectSketch('Sketch 2');
    assert.deepEqual(await contours(0),partial);
    assert.deepEqual(await contours(1),independent);
    assert.equal(await exportButton.isEnabled(),true);
    const [unaffected] = await Promise.all([page.waitForEvent('download'),exportButton.click()]);
    assert.equal(unaffected.suggestedFilename(),'svg-box-designer-applied.svg');
    await selectSketch('Sketch 1');
    assert.equal(await exportButton.isDisabled(),true);
    await button('2D Drawing').click(); await reopen('Sketch 1');
    await setDimension('80'); await finish(); await button('Box / Construction').click();
    assert.equal(await group2.locator('.history-diagnostic-marker').count(),0);
    assert.deepEqual(await historyIds(),groupIds);
    const recovered = await contours(0);
    assert.notEqual(recovered[1],partial[1]);
    assert.notEqual(recovered[2],partial[2]);
    assert.deepEqual(await contours(1),independent);
    assert.equal(await exportButton.isEnabled(),true);
    const [repaired] = await Promise.all([page.waitForEvent('download'),exportButton.click()]);
    assert.equal(repaired.suggestedFilename(),'svg-box-designer-applied.svg');
    console.log('PASS Chromium: shared-panel TB isolation, strict Apply, inactive contours, independent export and automatic repair');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

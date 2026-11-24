// Real CAD pointer input and production BOX controls, including scoped manufacturing export.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1366,height:768}});
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror',e=>errors.push(e.message));
    const button = name => page.getByRole('button',{name,exact:true});
    const press = name => button(name).click();
    const rail = page.getByLabel('Tool sidebar',{exact:true});
    const pm = () => rail.getByRole('button',{name:'Panel Manager'}).click();
    const inspector = page.getByLabel('Active Tool overlay',{exact:true});
    const inputs = inspector.locator('.pm-panel-list input');
    const select = page.getByRole('combobox',{name:'Panel source'});
    const drawing = page.locator('.drawing-svg');
    async function point(x,y,action='click') {
      const p = await drawing.evaluate((el,[x,y])=>{
        const v = new DOMPoint(x,y).matrixTransform(el.getScreenCTM());
        return [v.x,v.y];
      },[x,y]);
      await page.mouse[action](...p);
    }
    async function line(x1,y1,x2,y2) {
      await press('Line'); await point(x1,y1); await point(x2,y2);
    }
    async function rectangle(x,y) {
      await line(x,y,x+80,y); await line(x+80,y,x+80,y+50);
      await line(x+80,y+50,x,y+50); await line(x,y+50,x,y);
    }
    async function apply() {
      await inspector.getByRole('button',{name:'Apply',exact:true}).click();
      assert.deepEqual(await page.locator('.notice:not(.inline-notice)').allTextContents(),[]);
    }
    const tools = () => rail.getByRole('button').allTextContents();
    const refs = page.locator('.box-reference');
    const box = () => press('Box / Construction');
    const reopen = name => page.getByRole('combobox',{name:'Reopen Sketch'}).selectOption({label:name});
    const finish = () => press('Finish Sketch');
    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await press('2D Drawing'); await press('New Sketch');
    await rectangle(-180,-80); await rectangle(-55,-80);
    await press('Circle'); await point(65,-30); await point(85,-30);
    await press('Arc'); await point(35,65); await point(95,65); await point(65,35);
    await finish();
    for (const width of [1920,1366,1024]) {
      await page.setViewportSize({width,height:width === 1920 ? 1080 : 768});
      await point(-140,-80,'move');
      assert.match(await page.getByRole('tooltip').innerText(),/Sketch 1.*double-click/);
      assert.equal(await drawing.locator('[data-highlighted] line').count(),8);
      assert.equal(await drawing.locator('[data-highlighted] circle').count(),1);
      assert.equal(await drawing.locator('[data-highlighted] path').count(),1);
      await point(-140,-120,'move'); assert.equal(await drawing.locator('[data-highlighted]').count(),0);
      await box(); assert.deepEqual(await tools(),['PM']);
      await pm(); assert.equal(await inputs.count(),2);
      const canvas = await page.locator('.workspace-canvas:visible').boundingBox();
      const history = await page.getByLabel('Construction history').boundingBox();
      assert.ok(canvas.y + canvas.height <= history.y + 1);
      await press('2D Drawing');
    }
    await page.setViewportSize({width:1366,height:768});
    await box(); await pm(); await press('Accept default thickness');
    await inputs.nth(1).fill('6'); await apply();
    assert.match(await page.locator('.box-source-indicator').innerText(),/Working on Sketch 1/);
    assert.ok((await tools()).includes('TB'));
    await rail.getByRole('button',{name:'TB',exact:true}).click();
    const edges = page.locator('.edge-hitbox');
    async function edge(n) {
      const p = await edges.nth(n).evaluate(el=>{
        const middle = el.getPointAtLength(el.getTotalLength()/2).matrixTransform(el.getScreenCTM());
        const hit = document.elementFromPoint(middle.x,middle.y);
        return [middle.x,middle.y,hit === el ? '' : hit?.outerHTML.slice(0,250) ?? 'outside'];
      });
      assert.equal(p[2],'','edge '+n+' at '+p.slice(0,2));
      await page.mouse.click(p[0],p[1]);
    }
    await edge(2); await edge(6);
    assert.ok(await inspector.getByRole('button',{name:'TB1 2 edges'}).isVisible(),await inspector.innerText());
    await apply();
    const accepted = await page.locator('.final-contour-kerf-layer').innerHTML();
    const download = page.waitForEvent('download');
    await page.getByRole('button',{name:/export/i}).click();
    assert.match((await download).suggestedFilename(),/applied/);
    await press('2D Drawing'); await press('New Sketch');
    await rectangle(-180,25); await rectangle(-55,25); await finish();
    await press('New Sketch'); await rectangle(-165,-60); await finish(); await box();
    assert.deepEqual(await tools(),['PM']);
    await pm(); await select.selectOption({label:'Sketch 2'}); await press('Accept default thickness'); await apply();
    assert.deepEqual(await tools(),['PM']); await press('Work on Sketch 2');
    assert.ok((await tools()).includes('W'));
    await pm(); await select.selectOption({label:'Sketch 1'}); await press('Work on Sketch 1');
    assert.equal(await page.locator('.final-contour-kerf-layer').innerHTML(),accepted);
    await press('2D Drawing'); await reopen('Sketch 1');
    await line(-160,105,-100,120); await finish(); await box();
    assert.deepEqual(await tools(),['PM']);
    assert.deepEqual(await refs.evaluateAll(es=>es.map(e=>e.dataset.status)),['Changed · needs review','Approved','Needs Panel Manager']);
    await pm();
    assert.match(await inspector.innerText(),/3 open, invalid or unsupported/);
    assert.deepEqual(await inputs.evaluateAll(es=>es.map(e=>Number(e.value))),[3,6]);
    await press('Undo (Ctrl+Z)'); await press('Undo (Ctrl+Z)');
    await press('Redo (Ctrl+Y)'); await press('Redo (Ctrl+Y)');
    await pm(); await apply(); await press('Work on Sketch 1');
    assert.ok(await page.getByRole('button',{name:/export/i}).isDisabled());
    assert.match(await page.locator('.box-source-indicator').innerText(),/Apply geometry/);
    await pm(); await select.selectOption({label:'Sketch 2'}); await press('Work on Sketch 2');
    assert.match(await page.locator('.box-source-indicator').innerText(),/Sketch 2/);
    assert.deepEqual(errors,[]);
    console.log('PASS mounted Drawing panels, hover and three viewport widths, PM, TB, manufacturing export, source switching, review and traversal');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

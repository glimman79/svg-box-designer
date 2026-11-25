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
    await press('New Sketch'); await rectangle(-180,25); await rectangle(-55,25); await finish();
    const drawingColors = await drawing.locator('.drawing-reference-sketch').evaluateAll(es=>es.map(e=>getComputedStyle(e.firstElementChild).stroke));
    const canvas = page.locator('svg.design-svg:not(.drawing-svg)');
    const camera = () => canvas.getAttribute('viewBox');
    const tool = name => rail.getByRole('button',{name,exact:true}).click();
    const history = page.getByLabel('Construction history',{exact:true});
    const entries = history.locator('[data-operation-id]');
    const names = () => entries.allTextContents();
    const ids = () => entries.evaluateAll(es=>es.map(e=>e.dataset.operationId));
    const paths = n => refs.nth(n-1).locator('.final-panel-path,.final-slot-path').evaluateAll(es=>es.map(e=>e.getAttribute('d')));
    const working = async n => assert.match(await page.locator('.box-source-indicator').innerText(),new RegExp('Working on Sketch '+n));
    async function boxPoint(x,y,action='click',dy=0) {
      const p = await canvas.evaluate((el,[x,y])=>{
        const v = new DOMPoint(x,y).matrixTransform(el.getScreenCTM()); return [v.x,v.y];
      },[x,y]);
      await page.mouse[action](p[0],p[1]+dy);
    }
    await box(); await pm(); await page.locator('.canvas-zoom-controls:visible').getByText('Fit').click();
    await press('Accept default thickness'); await inputs.nth(1).fill('6'); await apply(); await working(1);
    await boxPoint(-140,50); assert.equal(await select.locator('option:checked').innerText(),'Sketch 2');
    assert.deepEqual(await tools(),['PM']);
    await press('Accept default thickness'); await apply(); await working(2);
    assert.ok((await tools()).includes('TB'));
    const initialNames = ['Sketch 1','Sketch 2','Panel Manager (Sketch 1)','Panel Manager (Sketch 2)'];
    assert.deepEqual(await names(),initialNames);
    const normalColors = () => refs.evaluateAll(es=>es.map(e=>getComputedStyle(e.querySelector('.final-panel-path')).stroke));
    await page.mouse.move(0,0); assert.deepEqual(await normalColors(),drawingColors);
    const zoom = page.locator('.canvas-zoom-controls:visible');
    // Six screen pixels outside a closed edge at two different scales.
    for (const scale of [0,1]) {
      if (scale) await zoom.getByRole('button',{name:'Zoom out'}).click();
      await boxPoint(-140,-80,'move',-6);
      assert.equal(await page.getByRole('tooltip').innerText(),'Sketch 1'); await working(2);
      const highlighted = refs.nth(0).locator('.final-panel-path,.box-reference-members > :is(circle,path)').filter({visible:true});
      assert.ok(await highlighted.count() >= 4);
      assert.ok(await refs.nth(0).evaluate(e=>[...e.querySelectorAll('.final-panel-path,:scope > .box-reference-members > *')]
        .every(child=>getComputedStyle(child).stroke==='rgb(18, 71, 86)')));
      await boxPoint(-140,-80,'click',-6); await working(1);
      assert.equal(await select.count(),0);
      await boxPoint(-140,50); await working(2);
      await page.mouse.move(0,0); assert.deepEqual(await normalColors(),drawingColors);
    }
    const beforePan = await camera();
    await boxPoint(-140,0,'move'); await page.mouse.down({button:'right'});
    await boxPoint(-130,4,'move'); await page.mouse.up({button:'right'});
    const userView = await camera(); assert.notEqual(userView,beforePan);
    const sameCamera = async () => assert.equal(await camera(),userView);
    await boxPoint(-140,-55); await working(1); await sameCamera();
    const sourcePaths = [await paths(1),await paths(2)];
    await tool('TB'); await sameCamera(); assert.deepEqual(await names(),initialNames);
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
    const ok = () => inspector.getByRole('button',{name:'OK',exact:true}).click();
    const undo = () => press('Undo (Ctrl+Z)'), redo = () => press('Redo (Ctrl+Y)');
    await edge(2); await edge(6); await sameCamera();
    assert.ok(await inspector.getByRole('button',{name:'TB1 2 edges'}).isVisible());
    const firstGroupOrder = await ids();
    await edge(3); await edge(7);
    assert.ok(await inspector.getByRole('button',{name:'TB2 2 edges'}).isVisible());
    assert.deepEqual(await ids(),firstGroupOrder);
    await apply(); await sameCamera(); await ok(); await sameCamera();
    assert.deepEqual(await ids(),firstGroupOrder);
    const tb1 = await paths(1); assert.notDeepEqual(tb1,sourcePaths[0]);
    await boxPoint(-140,50); await working(2); await sameCamera();
    await tool('TB'); await edge(2); await edge(6); await apply(); await ok();
    const tb2 = await paths(2); assert.notDeepEqual(tb2,sourcePaths[1]);
    for (const n of [1,2]) {
      await boxPoint(-140,n===1 ? -55 : 50); await working(n); await sameCamera();
      assert.deepEqual(await paths(1),tb1); assert.deepEqual(await paths(2),tb2);
      const download = page.waitForEvent('download'); await press('Export');
      const file = await download; assert.match(file.suggestedFilename(),/applied/);
      const contents = require('node:fs').readFileSync(await file.path(),'utf8');
      assert.deepEqual([...contents.matchAll(/<path d="([^"]+)"/g)].map(m=>m[1]),n===1 ? tb1 : tb2);
    }
    const beforeDimensionPaths = await paths(1);
    const beforeDimensionIds = await ids();
    await press('2D Drawing'); await reopen('Sketch 1');
    await press('Dimension'); await point(-140,-80); await point(-140,-120);
    const dimensionValue = page.locator('.drawing-dimension-value-hit').last();
    await dimensionValue.dblclick();
    const dimensionEditor = page.getByRole('textbox',{name:'Dimension value in millimetres'});
    await dimensionEditor.fill('90'); await dimensionEditor.press('Enter');
    await finish(); await box();
    assert.deepEqual(await ids(),beforeDimensionIds);
    assert.deepEqual(await refs.evaluateAll(es=>es.map(e=>e.dataset.status)).then(status=>status.slice(0,2)),['Approved','Approved']);
    const resizedPaths = await paths(1); assert.notDeepEqual(resizedPaths,beforeDimensionPaths);
    assert.ok(resizedPaths.length);
    await boxPoint(-140,-55); await tool('TB'); await edge(0); await edge(4); await apply(); await ok();
    await boxPoint(-140,50); await tool('W'); await edge(1);
    const expected = [...initialNames,'TB Group 1 (Sketch 1)','TB Group 1 (Sketch 2)','TB Group 2 (Sketch 1)','W Group 1 (Sketch 2)'];
    assert.deepEqual(await names(),expected);
    const permanentIds = await ids();
    await undo(); assert.deepEqual(await ids(),permanentIds.slice(0,-1)); await sameCamera();
    await boxPoint(-140,-55); await working(1); assert.ok(await button('Redo (Ctrl+Y)').isEnabled());
    await redo(); assert.deepEqual(await ids(),permanentIds); await sameCamera();
    await press('2D Drawing'); assert.deepEqual(await names(),expected);
    await history.getByRole('button',{name:'TB Group 1 (Sketch 1)',exact:true}).click();
    await working(1); assert.equal(await inspector.locator('.active-label-card strong').innerText(),'TB1');
    assert.ok(await inspector.getByRole('button',{name:'TB2 2 edges'}).isVisible());
    await inspector.getByRole('button',{name:'TB2 2 edges'}).click();
    await page.locator('#compact-edge-tab-size').fill('12'); await apply();
    assert.deepEqual(await ids(),permanentIds); await sameCamera();
    await pm(); await sameCamera();
    const inspectorWidth = (await inspector.boundingBox()).width;
    await page.setViewportSize({width:680,height:768});
    assert.notEqual((await inspector.boundingBox()).width,inspectorWidth); await sameCamera();
    await page.setViewportSize({width:1366,height:768}); await sameCamera();
    await select.selectOption({label:'Sketch 2'}); await working(2);
    assert.equal(await select.count(),0); await sameCamera();
    await boxPoint(-140,-55); await tool('TB'); await edge(1);
    assert.deepEqual(await names(),[...expected,'TB Group 3 (Sketch 1)']); await sameCamera();
    await zoom.getByText('Fit').click(); assert.notEqual(await camera(),userView);
    await press('2D Drawing'); await press('New Sketch'); await rectangle(-165,-60); await finish();
    await box(); await tool('Select'); await boxPoint(-140,-50);
    const choices = page.getByRole('group',{name:'Choose a BOX source'});
    assert.deepEqual((await choices.getByRole('button').allTextContents()).sort(),['Sketch 1','Sketch 3']);
    await page.keyboard.press('Escape');
    assert.equal(await choices.count(),0);
    await working(1);
    await boxPoint(-140,-50);
    await choices.getByRole('button',{name:'Sketch 3'}).click();
    assert.equal(await select.locator('option:checked').innerText(),'Sketch 3');
    assert.deepEqual(await tools(),['PM']);
    await select.selectOption({label:'Sketch 1'}); await working(1);
    const beforeLooseLine = await paths(1);
    await press('2D Drawing'); await reopen('Sketch 1'); await line(-160,105,-100,120); await finish(); await box();
    assert.ok((await tools()).includes('TB'));
    assert.deepEqual(await refs.evaluateAll(es=>es.map(e=>e.dataset.status)),['Approved','Approved','Needs Panel Manager']);
    assert.deepEqual(await paths(1),beforeLooseLine); assert.deepEqual(await paths(2),tb2);
    await pm(); assert.match(await inspector.innerText(),/3 open, invalid or unsupported/);
    assert.deepEqual(await inputs.evaluateAll(es=>es.map(e=>Number(e.value))),[3,6]);
    await undo(); await undo(); await redo(); await redo(); await pm();
    await working(1);
    assert.deepEqual(await paths(1),beforeLooseLine); assert.deepEqual(await paths(2),tb2);
    assert.equal(await page.getByRole('button',{name:/Work on Sketch/}).count(),0);
    // Evict the creation frames with real edits and verify the interleaved DOM order and IDs.
    const older = await ids();
    await tool('MFG');
    const kerf = page.locator('#manufacturing-kerf');
    for (let i=0;i<33;i++) {
      await kerf.fill(((21+i)/100).toFixed(2)); await kerf.press('Enter');
    }
    assert.deepEqual((await ids()).slice(0,-1),older);
    assert.equal((await names()).at(-1),'MFG (Sketch 1)');
    await press('2D Drawing'); assert.deepEqual((await ids()).slice(0,-1),older);
    await press('Clear'); await press('Clear Without Saving'); assert.deepEqual(await ids(),[]);
    assert.deepEqual(errors,[]);
    console.log('PASS multi-source hit targets, hover, activation, colors, two applied TB outputs, scoped exports, interleaved History, traversal, zoom/pan, overlap and invalidation');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

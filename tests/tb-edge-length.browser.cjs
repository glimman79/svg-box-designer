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
    const contours = () => page.locator('.final-contour-kerf-layer').innerHTML();
    async function point(x,y) {
      const p = await drawing.evaluate((svg,[x,y]) => {
        const p = new DOMPoint(x,y).matrixTransform(svg.getScreenCTM()); return [p.x,p.y];
      },[x,y]);
      await page.mouse.click(...p);
    }
    async function line(x1,y1,x2,y2) { await button('Line').click(); await point(x1,y1); await point(x2,y2); }
    async function rectangle(x) {
      await line(x,-80,x+80,-80); await line(x+80,-80,x+80,-30);
      await line(x+80,-30,x,-30); await line(x,-30,x,-80);
    }
    async function edge(index) {
      const p = await page.locator('.edge-hitbox').nth(index).evaluate(el => {
        const p = el.getPointAtLength(el.getTotalLength()/2).matrixTransform(el.getScreenCTM());
        return [p.x,p.y,document.elementFromPoint(p.x,p.y) === el,document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,200)];
      });
      assert.equal(p[2],true,`edge ${index} is reachable: ${JSON.stringify(p)}`);
      await page.mouse.click(p[0],p[1]);
    }
    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await button('2D Drawing').click(); await button('New Sketch').click();
    await rectangle(-180); await rectangle(-55);
    await button('Finish Sketch').click(); await button('Box / Construction').click();
    await rail.getByRole('button',{name:'Panel Manager'}).click();
    await button('Accept default thickness').click();
    await overlay.getByRole('button',{name:'Apply',exact:true}).click();
    await overlay.getByRole('button',{name:'OK',exact:true}).click();
    await page.locator('.canvas-zoom-controls:visible').getByRole('button',{name:'Fit'}).click();
    await page.locator('.canvas-zoom-controls:visible').getByRole('button',{name:'Zoom out'}).click();
    await rail.getByRole('button',{name:'TB',exact:true}).click();
    await edge(2); await edge(6);
    await overlay.getByRole('button',{name:'Apply',exact:true}).click();
    await overlay.getByRole('button',{name:'OK',exact:true}).click();
    await history.getByRole('button',{name:/^TB Group 1/}).click();
    await overlay.getByRole('button',{name:'Apply',exact:true}).click();
    await overlay.getByRole('button',{name:'OK',exact:true}).click();
    const valid = await contours();
    const group = history.locator('button[data-operation-id]').filter({hasText:'TB Group 1'});
    assert.equal(await group.locator('.history-diagnostic-marker').count(),0);

    await button('2D Drawing').click();
    await page.getByRole('combobox',{name:'Reopen Sketch'}).selectOption({label:'Sketch 1'});
    await button('Dimension').click(); await point(-15,-30); await point(-15,-55);
    const value = page.locator('.drawing-dimension-value-hit').last();
    await value.dblclick();
    const editor = page.getByRole('textbox',{name:'Dimension value in millimetres'});
    await editor.fill('95'); await editor.press('Enter');
    await button('Finish Sketch').click(); await button('Box / Construction').click();
    assert.equal(await group.locator('.history-diagnostic-marker').count(),1);
    assert.match(await group.getAttribute('title'),/TB_EDGE_LENGTH_MISMATCH.*mm/);
    assert.notEqual(await contours(),valid);
    await group.click();
    assert.match(await history.locator('.history-diagnostic-detail').innerText(),/TB_EDGE_LENGTH_MISMATCH/);
    await overlay.getByRole('button',{name:'Apply',exact:true}).click();
    assert.match(await page.locator('.notice:not(.inline-notice)').innerText(),/incompatible source edge lengths/);
    assert.equal(await group.locator('.history-diagnostic-marker').count(),1);
    console.log('PASS Chromium: Drawing dimension mismatch marks TB History and manual Apply rejects it');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const output = process.env.UI21_BROWSER_OUTPUT;
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 const page = await browser.newPage({ viewport: {width:1366,height:768} });
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const button = name => page.getByRole('button',{name,exact:true});
 const settings=()=>button('Settings');
 const category=()=>page.getByRole('menuitem',{name:'Icon size'});
 const option=name=>page.getByRole('menuitemradio',{name,exact:true});
 const menu=()=>page.getByRole('menu',{name:'Settings',exact:true});
 async function choose(size) { await settings().click(); await category().click(); await option(size).click(); await page.waitForFunction(s=>document.documentElement.dataset.uiSize===s,size.toLowerCase()); }
 const svg=()=>page.locator('svg.drawing-svg');
 async function click(p) { const c=await svg().evaluate((s,p)=>{const c=new DOMPoint(p.x,p.y).matrixTransform(s.getScreenCTM());return {x:c.x,y:c.y}},p);await page.mouse.click(c.x,c.y); }
 try {
  await page.goto(process.env.WORKSPACE_BROWSER_URL||'http://127.0.0.1:5173/'); await settings().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.uiSize),'normal');
  await settings().click(); await category().hover(); await option('Normal').waitFor(); assert.equal(await option('Normal').getAttribute('aria-checked'),'true');
  await option('Small').hover(); assert.equal(await option('Small').isVisible(),true); await option('Small').click();
  assert.equal(await settings().evaluate(e=>document.activeElement===e),true);
  await page.reload(); await settings().waitFor(); assert.equal(await page.evaluate(()=>document.documentElement.dataset.uiSize),'small');
  await settings().focus(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.uiSize),'normal');
  await settings().click(); await category().click(); await page.keyboard.press('Escape'); assert.equal(await menu().isVisible(),true);assert.equal(await page.getByRole('menu',{name:'Icon size',exact:true}).count(),0);
  await page.keyboard.press('Escape');assert.equal(await menu().count(),0);
  await settings().click();await page.keyboard.press('Tab');assert.equal(await menu().count(),0);assert.equal(await page.evaluate(()=>document.activeElement===document.body),false);
  await settings().click();await button('2D Drawing').click();assert.equal(await menu().count(),0);
  for(const name of ['Select','Line','Circle','Arc','Profile']) assert.equal(await page.getByLabel('Drawing tools',{exact:true}).getByRole('button',{name,exact:true}).count(),1);
  for(const name of ['Dimension','Constraints']) {assert.equal(await page.getByLabel('Drawing tools',{exact:true}).getByRole('button',{name,exact:true}).count(),0);assert.equal(await page.getByRole('toolbar',{name:'Drawing header tools'}).getByRole('button',{name,exact:true}).count(),1);}
  await button('Dimension').focus();await page.keyboard.press('Enter');assert.equal(await button('Dimension').getAttribute('aria-pressed'),'true');assert.match(await button('Dimension').getAttribute('class'),/is-active/);await page.keyboard.press('Escape');assert.equal(await button('Select').getAttribute('aria-pressed'),'true');
  await button('Constraints').click();assert.equal(await button('Constraints').getAttribute('aria-pressed'),'true');await page.getByRole('dialog',{name:'Constraints',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await button('Constraints').getAttribute('aria-pressed'),'false');
  await button('Line').click();await click({x:-120,y:-70});await click({x:-20,y:-70});await page.waitForFunction(()=>document.querySelectorAll('[data-sketch-line-id]').length===1);
  await button('Select').click();await button('Undo (Ctrl+Z)').click();
  const before=await svg().getAttribute('viewBox');
  await page.evaluate(()=>{window.drawingOwner=document.querySelector('.drawing-workspace');window.boxOwner=document.querySelector('.workspace:not(.drawing-workspace)');});
  await button('Circle').click();await click({x:40,y:0});
  for(const size of ['Small','Normal','Large']) {await choose(size);assert.equal(await button('Circle').getAttribute('aria-pressed'),'true');assert.equal(await button('Redo (Ctrl+Y)').isEnabled(),true);assert.equal(await svg().getAttribute('viewBox'),before);}
  await click({x:70,y:0});await page.waitForFunction(()=>document.querySelectorAll('[data-sketch-circle-id]').length===1);
  for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]) {
   await page.setViewportSize({width,height});
   for(const size of ['Small','Normal','Large']) {
    await choose(size);
    for(const module of ['2D Drawing','Box / Construction']) {
     await button(module).click();
     const layout=await page.locator('.top-toolbar').evaluate(e=>{const rs=[...e.children].map(e=>e.getBoundingClientRect());return {height:e.getBoundingClientRect().height,rows:[...new Set(rs.map(r=>Math.round(r.top+r.height/2)))],overflow:document.documentElement.scrollWidth>innerWidth,overlap:rs.some((r,i)=>rs.some((q,j)=>i<j&&Math.min(r.right,q.right)-Math.max(r.left,q.left)>1&&Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top)>1)),outside:rs.some(r=>r.left<0||r.right>innerWidth)};});
     assert.equal(layout.overflow,false,JSON.stringify({width,size,module,layout}));assert.equal(layout.overlap,false);assert.equal(layout.outside,false);
     const headerControls=await page.locator('.top-toolbar').evaluate(e=>{const rs=[...e.querySelectorAll('button,label.toolbar-button')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0);return {outside:rs.some(r=>r.left<0||r.right>innerWidth||r.bottom>innerHeight),overlap:rs.some((r,i)=>rs.some((q,j)=>i<j&&Math.min(r.right,q.right)-Math.max(r.left,q.left)>1&&Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top)>1))}});assert.deepEqual(headerControls,{outside:false,overlap:false});
     if(width>=1366 || size!=='Large')assert.equal(layout.rows.length,1,JSON.stringify({width,size,module,layout}));
     assert.ok(layout.height<=110,JSON.stringify({width,size,layout}));
     console.log(JSON.stringify({width,height,size,module,layout}));
     if(output && ((width===1366 && size==='Normal')||(width===1024 && ['Small','Large'].includes(size)))) {fs.mkdirSync(output,{recursive:true});await page.screenshot({path:`${output}/${module==='2D Drawing'?'drawing':'box'}-${width}-${size.toLowerCase()}.png`});}
     assert.equal(await page.getByRole('toolbar',{name:'Drawing header tools'}).count(),module==='2D Drawing'?1:0);
     assert.equal(await page.locator('.drawing-operation-toolbar').count(),0);
     assert.equal(await page.locator('.drawing-header-slot').count(),module==='2D Drawing'?1:0);
     const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return ['control-height','control-padding','gap','font','icon','tool-width'].map(k=>s.getPropertyValue(`--ui-${k}`).trim())});
     assert.deepEqual(tokens,{Small:['20px','4px','2px','10px','12px','44px'],Normal:['24px','5px','3px','11px','14px','48px'],Large:['28px','7px','4px','12px','16px','52px']}[size]);
     if(module==='2D Drawing') {
      const placement=await page.evaluate(()=>{
       const header=document.querySelector('.top-toolbar'), history=header.querySelector('.history-commands'), slot=header.querySelector('.drawing-header-slot');
       const card=document.querySelector('.drawing-canvas-card'), frame=card.querySelector('.canvas-frame'), rail=document.querySelector('.drawing-tool-sidebar');
       const rect=e=>e.getBoundingClientRect();
       const controls=[...header.querySelectorAll('button, label.toolbar-button')].filter(e=>rect(e).width>0);
       return {directlyAfterHistory:history.nextElementSibling===slot,nextIsNavigation:slot.nextElementSibling.matches('nav'),tools:[...slot.querySelectorAll('button')].map(e=>e.textContent),left:[...rail.querySelectorAll('button')].map(e=>e.textContent),frameOnlyChild:card.children.length===1&&card.firstElementChild===frame,canvasGap:rect(frame).top-rect(header).bottom,controlOverlap:controls.some((e,i)=>controls.some((f,j)=>i<j&&Math.min(rect(e).right,rect(f).right)-Math.max(rect(e).left,rect(f).left)>1&&Math.min(rect(e).bottom,rect(f).bottom)-Math.max(rect(e).top,rect(f).top)>1)),controlOutside:controls.some(e=>rect(e).left<0||rect(e).right>innerWidth||rect(e).bottom>innerHeight)};
      });
      assert.equal(placement.directlyAfterHistory,true);assert.equal(placement.nextIsNavigation,true);assert.deepEqual(placement.tools,['Dimension','Constraints']);assert.deepEqual(placement.left,['Select','Line','Circle','Arc','Profile']);assert.equal(placement.frameOnlyChild,true);assert.ok(placement.canvasGap<=2,JSON.stringify(placement));assert.equal(placement.controlOverlap,false);assert.equal(placement.controlOutside,false);
     } else for(const name of ['Dimension','Constraints'])assert.equal(await button(name).count(),0);
    }
   }
  }
  assert.equal(await page.evaluate(()=>window.drawingOwner===document.querySelector('.drawing-workspace')&&window.boxOwner===document.querySelector('.workspace:not(.drawing-workspace)')),true);
  // Force a category to the right edge to exercise submenu collision independent of header wrapping.
  await settings().evaluate(e=>{e.style.position='fixed';e.style.right='4px';e.style.top='10px';e.style.zIndex='200'});await settings().click();await category().hover();
  const collision=await page.getByRole('menu',{name:'Icon size',exact:true}).evaluate(e=>{const r=e.getBoundingClientRect();const p=document.querySelector('[role=menuitem]').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,parent:p.left,width:innerWidth,height:innerHeight}});
  assert.ok(collision.right<=collision.parent+1,JSON.stringify(collision));assert.ok(collision.left>=0&&collision.bottom<=collision.height);
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await settings().evaluate(e=>e.removeAttribute('style'));
  await page.getByLabel('Import SVG into BOX / Construction',{exact:true}).setInputFiles({name:'panels.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100"><rect width="100" height="80"/><rect x="130" width="100" height="80"/></svg>')});
  await page.getByRole('dialog',{name:'Panel Manager',exact:true}).getByRole('button',{name:'OK',exact:true}).click();
  const overlay=page.getByRole('complementary',{name:'Active Tool overlay'});await overlay.getByRole('heading',{name:'Panel Manager',exact:true}).waitFor();
  const boxView=await page.getByRole('img',{name:'Imported SVG with selectable edges',exact:true}).getAttribute('viewBox');
  const pmFields=await overlay.locator('input').evaluateAll(es=>es.map(e=>e.value));
  for(const size of ['Small','Normal','Large']) {await choose(size);await overlay.getByRole('heading',{name:'Panel Manager',exact:true}).waitFor();assert.deepEqual(await overlay.locator('input').evaluateAll(es=>es.map(e=>e.value)),pmFields);assert.equal(await page.getByRole('img',{name:'Imported SVG with selectable edges',exact:true}).getAttribute('viewBox'),boxView);assert.equal(await overlay.getByRole('button',{name:'OK',exact:true}).isDisabled(),true);}
  const order=await overlay.evaluate(e=>{const main=e.querySelector('.contextual-tool-actions').getBoundingClientRect(), action=[...e.querySelectorAll('button')].find(b=>b.textContent==='Accept default thickness').getBoundingClientRect(),list=e.querySelector('.pm-panel-list').getBoundingClientRect();return main.bottom<=action.top && action.bottom<=list.top});assert.equal(order,true);
  assert.equal(await overlay.getByRole('button',{name:'OK',exact:true}).isDisabled(),true);await overlay.getByRole('button',{name:'Accept default thickness'}).click();await overlay.getByRole('button',{name:'Apply',exact:true}).click();await overlay.getByRole('button',{name:'OK',exact:true}).click();
  const pm=page.getByRole('button',{name:'Panel Manager, opens Panel Manager panel',exact:true});assert.equal(await pm.getAttribute('title'),'Panel Manager');await pm.click();
  assert.equal(await overlay.getByRole('button',{name:/Finish/}).count(),0);
  if(output) {await page.screenshot({path:`${output}/panel-manager-1024-large.png`});await settings().click();await category().hover();await option('Normal').hover();await page.screenshot({path:`${output}/settings-menu-1024-large.png`});await page.keyboard.press('Escape');await page.keyboard.press('Escape');}
  assert.deepEqual(errors,[]);
  // Denied storage must still give a working Normal fallback and live selection.
  const denied=await browser.newContext();await denied.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('denied')}})});const p=await denied.newPage();await p.goto('http://127.0.0.1:5173/');await p.getByRole('button',{name:'Settings',exact:true}).waitFor();assert.equal(await p.evaluate(()=>document.documentElement.dataset.uiSize),'normal');await p.getByRole('button',{name:'Settings',exact:true}).click();await p.getByRole('menuitem',{name:'Icon size'}).click();await p.getByRole('menuitemradio',{name:'Large'}).click();assert.equal(await p.evaluate(()=>document.documentElement.dataset.uiSize),'large');await denied.close();
  console.log('PASS: sizing matrix, nested menu, persistence/storage fallback, placement, Panel Manager/OK and retained CAD/history');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

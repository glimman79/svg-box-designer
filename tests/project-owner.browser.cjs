// Real production UI inputs. No project/store injection or test-only app hooks.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1366,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const overlay=page.getByLabel('Active Tool overlay',{exact:true});
  const tool=name=>page.getByLabel('Tool sidebar',{exact:true}).getByRole('button',{name,exact:true});
  const action=name=>overlay.getByRole('button',{name,exact:true});
  const history=page.getByRole('complementary',{name:'Construction history',exact:true});
  const contours=()=>page.locator('.final-contour-kerf-layer').innerHTML();
  const undo=()=>page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true});
  const redo=()=>page.getByRole('button',{name:'Redo (Ctrl+Y)',exact:true});
  const edit=async(selector,value)=>{const input=page.locator(selector);await input.fill(value);await input.press(await input.getAttribute('type')==='text'?'Enter':'Tab');assert.equal(await input.inputValue(),value);};
  const edge=async index=>{
    const p=await page.locator('.edge-hitbox').nth(index).evaluate(e=>{const p=new DOMPoint((+e.getAttribute('x1')+ +e.getAttribute('x2'))/2,(+e.getAttribute('y1')+ +e.getAttribute('y2'))/2).matrixTransform(e.getScreenCTM());return {x:p.x,y:p.y};});
    await page.mouse.click(p.x,p.y);
  };
  try{
    const panels='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100"><rect width="100" height="80"/><rect x="130" width="100" height="80"/></svg>';
    for(const name of ['TB','W','S']){
      await page.goto(process.env.WORKSPACE_BROWSER_URL||'http://127.0.0.1:5173/');
      await page.getByLabel('Import SVG into BOX / Construction',{exact:true}).setInputFiles({name:'owner.svg',mimeType:'image/svg+xml',buffer:Buffer.from(panels)});
      await page.getByRole('dialog',{name:'Panel Manager',exact:true}).getByRole('button',{name:'OK',exact:true}).click();
      await action('Accept default thickness').click();
      await edit('#pm-panel-thickness-panel-1','4');
      await action('Apply').click();await action('OK').click();
      await tool(name).click();await edge(0);await edge(4);
      const input=name==='S'?'#compact-slot-tab-size':'#compact-edge-tab-size';
      await edit(input,name==='S'?'15':'10');
      if(name==='S') await edit('#compact-slot-offset','5');
      await action('Apply').click();assert.equal(await page.locator('.notice:not(.inline-notice)').count(),0);
      const output=await contours();assert.match(output,/<path/);
      await action('OK').click();
      await undo().click();await history.getByRole('button',{name:new RegExp(`^${name} Group 1,`)}).click();
      assert.equal(await action('OK').count(),1,'Undo reopens the authored workflow');
      await redo().click();assert.equal(await action('OK').count(),0,'Redo restores completed state');assert.equal(await contours(),output);
      await tool('MFG').click();await edit('#manufacturing-kerf','0.25');await action('Apply').click();
      assert.notEqual(await contours(),output);await undo().click();assert.equal(await contours(),output);
      await redo().click();assert.notEqual(await contours(),output);
      console.log(`PASS ${name}: actual SVG import, PM thickness edit/Apply, assignment, property edits, Geometry Apply, Finish, local Undo/Redo, manufacturing settings/Apply`);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

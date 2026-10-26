// Production UI only: no injected documents, solver calls, or React state access.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const results=[];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const client=(page,p)=>page.locator('svg.drawing-svg').evaluate((s,p)=>{const q=new DOMPoint(p.x,p.y).matrixTransform(s.getScreenCTM());return{x:q.x,y:q.y};},p);
 const click=async(page,p)=>{const q=await client(page,p);await page.mouse.click(q.x,q.y);};
 const pose=page=>page.evaluate(()=>({points:Object.fromEntries([...document.querySelectorAll('[data-sketch-point-id]')].map(e=>[e.dataset.sketchPointId,{x:+e.getAttribute('cx'),y:+e.getAttribute('cy')}])),line:[...document.querySelectorAll('[data-sketch-line-id]')].at(-1)&&(()=>{const e=[...document.querySelectorAll('[data-sketch-line-id]')].at(-1);return{a:{x:+e.getAttribute('x1'),y:+e.getAttribute('y1')},b:{x:+e.getAttribute('x2'),y:+e.getAttribute('y2')}};})()}));
 const near=(a,b,t=1e-5)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<t,`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
 const mid=p=>({x:(p.line.a.x+p.line.b.x)/2,y:(p.line.a.y+p.line.b.y)/2});
 const drag=async(page,start,delta,{cancel=false,steps=1}={})=>{const a=await client(page,start),b=await client(page,{x:start.x+delta.x,y:start.y+delta.y});await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps});const preview=await pose(page);if(cancel)await page.keyboard.press('Escape');await page.mouse.up();return preview;};
 for(const type of ['arc','line','circle'])for(const end of ['start','end']){
  if(process.env.COINCIDENCE_BROWSER_FILTER&&!`${type} ${end}`.includes(process.env.COINCIDENCE_BROWSER_FILTER))continue;
  const name=`manual ${type} point-point Coincidence at Line ${end}`;
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(process.env.COINCIDENCE_BROWSER_URL||'http://127.0.0.1:5173/');await page.getByRole('button',{name:'2D Drawing',exact:true}).click();
   await page.getByRole('button',{name:type==='arc'?'Arc':type==='circle'?'Circle':'Line',exact:true}).click();
   if(type==='arc'){await click(page,{x:100,y:0});await click(page,{x:0,y:100});await click(page,{x:Math.SQRT1_2*100,y:Math.SQRT1_2*100});}
   if(type==='circle'){await click(page,{x:0,y:100});await click(page,{x:30,y:100});}
   if(type==='line'){await click(page,{x:0,y:100});await click(page,{x:-60,y:170});}
   await page.locator(type==='arc'?'[data-sketch-arc-id]':type==='circle'?'[data-sketch-circle-id]':'[data-sketch-line-id]').waitFor();
   await page.keyboard.press('Escape');
   const supportPose=await pose(page),supportId=Object.keys(supportPose.points).sort((a,b)=>Math.hypot(supportPose.points[a].x,supportPose.points[a].y-100)-Math.hypot(supportPose.points[b].x,supportPose.points[b].y-100))[0];
   await page.keyboard.press('Escape');await page.getByRole('button',{name:'Line',exact:true}).click();
   // Ctrl bypasses authoring inference and preserves two separate identities.
   await page.keyboard.down('Control');await click(page,end==='start'?{x:20,y:110}:{x:120,y:140});await click(page,end==='end'?{x:20,y:110}:{x:120,y:140});await page.keyboard.up('Control');
   await page.keyboard.press('Escape');await page.waitForFunction(n=>document.querySelectorAll('[data-sketch-point-id]').length===n,Object.keys(supportPose.points).length+2);
   let p=await pose(page);const linePoint=Object.keys(p.points).find(id=>!(id in supportPose.points)&&Math.abs(p.points[id].x-20)<1);
   assert.ok(linePoint);await click(page,p.points[linePoint]);await page.keyboard.down('Control');await click(page,p.points[supportId]);await page.keyboard.up('Control');
   await page.getByRole('button',{name:'Constraints',exact:true}).click();await page.getByRole('button',{name:'Coincidence',exact:true}).click();await page.getByRole('button',{name:'OK',exact:true}).click();await page.getByRole('button',{name:'Constraints',exact:true}).click();
   const before=await pose(page);near(before.points[linePoint],before.points[supportId]);
   const check=p=>near(p.points[linePoint],p.points[supportId]);
   const preview=await drag(page,mid(before),{x:15,y:9});check(preview);const after=await pose(page);check(after);assert.deepEqual(after,preview);assert.notDeepEqual(after.points,before.points);
   await page.keyboard.press('Control+z');assert.deepEqual(await pose(page),before);await page.keyboard.press('Control+y');assert.deepEqual(await pose(page),after);
   const cancelled=await drag(page,mid(after),{x:-10,y:12},{cancel:true,steps:6});check(cancelled);assert.deepEqual(await pose(page),after);
   for(const delta of [{x:-15,y:-9},{x:12,y:8},{x:-8,y:12}]){const current=await pose(page);check(await drag(page,mid(current),delta,{steps:5}));check(await pose(page));}
   assert.deepEqual(errors,[]);results.push({name,status:'PASS'});console.log('PASS',name);
  }catch(e){results.push({name,status:'FAIL',error:e.stack});console.error('FAIL',name,e.message);}finally{await page.close();}
 }
 for(const type of ['arc','circle'])for(const end of ['start','end']){
  if(process.env.COINCIDENCE_BROWSER_FILTER&&!`${type} curve ${end}`.includes(process.env.COINCIDENCE_BROWSER_FILTER))continue;
  const name=`${type} point-curve at Line ${end}`,page=await browser.newPage({viewport:{width:1440,height:1000}});
  try{
   await page.goto(process.env.COINCIDENCE_BROWSER_URL||'http://127.0.0.1:5173/');await page.getByRole('button',{name:'2D Drawing',exact:true}).click();
   const p={x:Math.SQRT1_2*100,y:Math.SQRT1_2*100},q={x:150,y:140};
   await page.getByRole('button',{name:'Line',exact:true}).click();await page.keyboard.down('Control');await click(page,end==='start'?p:q);await click(page,end==='end'?p:q);await page.keyboard.up('Control');await page.keyboard.press('Escape');
   const lineBefore=await pose(page),pid=Object.keys(lineBefore.points).sort((a,b)=>Math.hypot(lineBefore.points[a].x-p.x,lineBefore.points[a].y-p.y)-Math.hypot(lineBefore.points[b].x-p.x,lineBefore.points[b].y-p.y))[0];
   await page.getByRole('button',{name:type==='arc'?'Arc':'Circle',exact:true}).click();
   if(type==='arc'){await click(page,{x:100,y:0});await click(page,{x:0,y:100});const fp=await client(page,p);await page.mouse.move(fp.x,fp.y);await page.evaluate(()=>new Promise(requestAnimationFrame));await click(page,p);await page.locator('[data-sketch-arc-id]').waitFor();}
   else{await click(page,{x:0,y:0});await click(page,p);await page.locator('[data-sketch-circle-id]').waitFor();}
   await page.keyboard.press('Escape');await page.locator('[data-constraint-id*="curve:"]').first().waitFor();
   const check=async()=>{
    const current=await pose(page),point=current.points[pid];
    const support=await page.evaluate(type=>{
     if(type==='circle'){const e=document.querySelector('[data-sketch-circle-id]');return{x:+e.getAttribute('cx'),y:+e.getAttribute('cy'),r:+e.getAttribute('r')};}
     const e=document.querySelector('[data-sketch-arc-id]'),n=e.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number),pts=[...document.querySelectorAll('[data-sketch-point-id]')].map(e=>({x:+e.getAttribute('cx'),y:+e.getAttribute('cy')}));
     const ends=[{x:n[0],y:n[1]},{x:n[7],y:n[8]}],line=document.querySelector('[data-sketch-line-id]'),lineEnds=[{x:+line.getAttribute('x1'),y:+line.getAttribute('y1')},{x:+line.getAttribute('x2'),y:+line.getAttribute('y2')}];
     const c=pts.find(p=>![...ends,...lineEnds].some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-5));return{...c,r:n[2]};
    },type);
    assert.ok(Math.abs(Math.hypot(point.x-support.x,point.y-support.y)-support.r)<1e-5,`first preview must satisfy Point-on-Curve: ${JSON.stringify({point,support})}`);return current;
   };
   const before=await check(),a=await client(page,mid(before)),b=await client(page,{x:mid(before).x+12,y:mid(before).y+8});
   await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);const preview=await check();await page.mouse.up();assert.deepEqual(await check(),preview);assert.notDeepEqual(preview.points,before.points);
   await page.keyboard.press('Control+z');assert.deepEqual(await pose(page),before);await page.keyboard.press('Control+y');assert.deepEqual(await pose(page),preview);
   await drag(page,mid(preview),{x:-8,y:6},{cancel:true,steps:5});assert.deepEqual(await check(),preview);
   for(const delta of [{x:-12,y:-8},{x:6,y:-4}]){const current=await pose(page);await drag(page,mid(current),delta,{steps:4});await check();}
   results.push({name,status:'PASS'});console.log('PASS',name);
  }catch(e){results.push({name,status:'FAIL',error:e.stack});console.error('FAIL',name,e.message);}finally{await page.close();}
 }
 await browser.close();if(process.env.COINCIDENCE_BROWSER_OUTPUT)fs.writeFileSync(process.env.COINCIDENCE_BROWSER_OUTPUT,JSON.stringify(results,null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();

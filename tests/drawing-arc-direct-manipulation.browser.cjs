// Run against `npm run dev -- --host 127.0.0.1` with Playwright installed.
// All geometry is authored and manipulated through the production UI.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseURL = process.env.ARC_BROWSER_URL || 'http://127.0.0.1:5173/';
const output = process.env.ARC_BROWSER_OUTPUT;
const close = (a,b,t=1e-5) => assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const pointClose = (a,b,t=1e-5) => {close(a.x,b.x,t);close(a.y,b.y,t);};
const results=[];
let currentContext;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 async function setup({orientation='CCW',major=false}={}) {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL);await page.getByRole('button',{name:'2D Drawing',exact:true}).click();
  await page.getByRole('button',{name:'Arc',exact:true}).click();
  const sign=(orientation==='CCW'?1:-1)*(major?-1:1);
  await click(page,{x:100,y:0});await click(page,{x:0,y:sign*100});
  await click(page,major?{x:-100,y:0}:{x:Math.SQRT1_2*100,y:sign*Math.SQRT1_2*100});
  await page.locator('[data-sketch-arc-id]').waitFor();
  await page.evaluate(()=>{
   const model=e=>{const svg=document.querySelector('svg.drawing-svg');const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return{x:p.x,y:p.y};};
   document.addEventListener('pointerdown',e=>{if(e.button===0&&e.target.closest('svg.drawing-svg'))window.arcBrowserInput={pointerId:e.pointerId,down:model(e),last:model(e),lastClient:{x:e.clientX,y:e.clientY}};},true);
   document.addEventListener('pointermove',e=>{if(e.buttons===1&&window.arcBrowserInput){window.arcBrowserInput.last=model(e);window.arcBrowserInput.lastClient={x:e.clientX,y:e.clientY};}},true);
  });
  currentContext={page,errors};return currentContext;
 }
 async function client(page,point) {
  return page.locator('svg.drawing-svg').evaluate((s,p)=>{
   const a=new DOMPoint(p.x,p.y).matrixTransform(s.getScreenCTM());return{x:a.x,y:a.y};
  },point);
 }
 async function click(page,point) {const c=await client(page,point);await page.mouse.click(c.x,c.y);}
 async function pose(page) {
  return page.evaluate(()=>{
   const path=document.querySelector('[data-sketch-arc-id]'),n=path.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
   const points=Object.fromEntries([...document.querySelectorAll('[data-sketch-point-id]')].map(e=>[e.dataset.sketchPointId,{x:+e.getAttribute('cx'),y:+e.getAttribute('cy')}]));
   const nearest=p=>Object.entries(points).sort((a,b)=>Math.hypot(a[1].x-p.x,a[1].y-p.y)-Math.hypot(b[1].x-p.x,b[1].y-p.y))[0][0];
   const start={x:n[0],y:n[1]},end={x:n[7],y:n[8]},a=nearest(start),b=nearest(end);
   // Authoring creates center first. Its identity remains persistent while
   // endpoint/shared-point and History interactions change its coordinates.
   const centerId=Object.keys(points).find(id=>id!==a&&id!==b);
   return {arcId:path.dataset.sketchArcId,points,startId:a,endId:b,centerId,radius:n[2],large:n[5],orientation:n[6],path:path.getAttribute('d'),selected:path.classList.contains('is-geometry-selected')};
  });
 }
 function body(p) {
  const c=p.points[p.centerId],a=p.points[p.startId],b=p.points[p.endId];
  let sweep=Math.atan2((a.x-c.x)*(b.y-c.y)-(a.y-c.y)*(b.x-c.x),(a.x-c.x)*(b.x-c.x)+(a.y-c.y)*(b.y-c.y));
  if(p.orientation===1&&sweep<=0)sweep+=2*Math.PI;if(p.orientation===0&&sweep>=0)sweep-=2*Math.PI;
  const angle=Math.atan2(a.y-c.y,a.x-c.x)+sweep/2;
  return {x:c.x+p.radius*Math.cos(angle),y:c.y+p.radius*Math.sin(angle),ux:Math.cos(angle),uy:Math.sin(angle)};
 }
 async function drag(page,start,delta,{steps=1,cancel=false,release=true}={}) {
  const a=await client(page,start),b=await client(page,{x:start.x+delta.x,y:start.y+delta.y});
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps});
  const preview=await pose(page),input=await page.evaluate(()=>window.arcBrowserInput);
  preview.delta={x:input.last.x-input.down.x,y:input.last.y-input.down.y};preview.down=input.down;
  if(cancel)await page.keyboard.press('Escape');if(release)await page.mouse.up();
  return preview;
 }
 async function scenario(name,run) {
  if(process.env.ARC_BROWSER_FILTER&&!name.includes(process.env.ARC_BROWSER_FILTER))return;
  let context;
  try {context=await run();assert.deepEqual(context.errors,[]);results.push({name,status:'PASS'});console.log('PASS',name);}
  catch(e){results.push({name,status:'FAIL',error:e.stack});console.error('FAIL',name,e.message);}
  finally {if(context||currentContext)await (context||currentContext).page.close();currentContext=null;}
 }
 for(const orientation of ['CW','CCW'])for(const major of [false,true]) {
  await scenario(`body radius preview/commit ${orientation} ${major?'major':'minor'}`,async()=>{
   const ctx=await setup({orientation,major}),{page}=ctx,before=await pose(page),p=body(before);
   const preview=await drag(page,p,{x:p.ux*20,y:p.uy*20},{steps:6}),after=await pose(page);
   const c=before.points[before.centerId],len=Math.hypot(preview.down.x-c.x,preview.down.y-c.y);
   const amount=preview.delta.x*(preview.down.x-c.x)/len+preview.delta.y*(preview.down.y-c.y)/len;
   assert.deepEqual(after.points[before.centerId],c);close(after.radius,before.radius+amount);
   assert.equal(after.orientation,before.orientation);assert.equal(after.large,before.large);assert.equal(preview.path,after.path);
   for(const id of [before.startId,before.endId])pointClose(after.points[id],{x:before.points[before.centerId].x+(before.points[id].x-before.points[before.centerId].x)*after.radius/before.radius,y:before.points[before.centerId].y+(before.points[id].y-before.points[before.centerId].y)*after.radius/before.radius});
   await page.keyboard.press('Control+z');assert.deepEqual((await pose(page)).points,before.points);
   await page.keyboard.press('Control+y');assert.deepEqual((await pose(page)).points,after.points);return ctx;
  });
 }
 for(const grip of ['center','P1','P2']) await scenario(`${grip} preview/commit exact semantics, Escape and Undo/Redo`,async()=>{
  const ctx=await setup(),{page}=ctx,before=await pose(page),id=grip==='center'?before.centerId:grip==='P1'?before.startId:before.endId;
  const preview=await drag(page,before.points[id],{x:20,y:15},{steps:5,cancel:true});assert.notEqual(preview.path,before.path);
  assert.deepEqual((await pose(page)).points,before.points);
  const committed=await drag(page,before.points[id],{x:20,y:15},{steps:4}),delta=committed.delta;const after=await pose(page);
  if(grip==='center'){
   close(after.radius,before.radius);for(const p of [before.centerId,before.startId,before.endId])pointClose(after.points[p],{x:before.points[p].x+delta.x,y:before.points[p].y+delta.y});
  } else {const pivot=grip==='P1'?before.endId:before.startId;assert.deepEqual(after.points[pivot],before.points[pivot]);pointClose(after.points[id],{x:before.points[id].x+delta.x,y:before.points[id].y+delta.y});}
  await page.keyboard.press('Control+z');assert.deepEqual((await pose(page)).points,before.points);
  await page.keyboard.press('Control+y');assert.deepEqual((await pose(page)).points,after.points);return ctx;
 });
 await scenario('body Escape and pointer-event frequency invariance',async()=>{
  const ctx=await setup(),{page}=ctx,before=await pose(page),p=body(before),delta={x:p.ux*25,y:p.uy*25};
  await drag(page,p,delta,{cancel:true});assert.deepEqual((await pose(page)).points,before.points);
  await drag(page,p,delta,{steps:1});const direct=await pose(page);await page.keyboard.press('Control+z');
  await drag(page,p,delta,{steps:18});assert.deepEqual((await pose(page)).points,direct.points);return ctx;
 });
 for(const grip of ['center','P1','P2']) await scenario(`${grip} pointer-event frequency invariance and reversal`,async()=>{
  const ctx=await setup(),{page}=ctx,before=await pose(page),id=grip==='center'?before.centerId:grip==='P1'?before.startId:before.endId;
  await drag(page,before.points[id],{x:20,y:15});const direct=await pose(page);await page.keyboard.press('Control+z');
  await drag(page,before.points[id],{x:20,y:15},{steps:15});assert.deepEqual((await pose(page)).points,direct.points);await page.keyboard.press('Control+z');
  const a=await client(page,before.points[id]),b=await client(page,{x:before.points[id].x+20,y:before.points[id].y+15});
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await page.mouse.move(a.x,a.y);await page.mouse.up();
  assert.deepEqual((await pose(page)).points,before.points);return ctx;
 });
 await scenario('click/Ctrl-click selection and below-threshold motion',async()=>{
  const ctx=await setup(),{page}=ctx,before=await pose(page),p=body(before);await click(page,p);
  assert.match(await page.locator('[data-sketch-arc-id]').getAttribute('class'),/is-geometry-selected/);
  await page.keyboard.down('Control');await click(page,p);await page.keyboard.up('Control');
  assert.doesNotMatch(await page.locator('[data-sketch-arc-id]').getAttribute('class'),/is-geometry-selected/);
  const a=await client(page,p);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+2,a.y);await page.mouse.up();assert.deepEqual((await pose(page)).points,before.points);return ctx;
 });
 async function radiusDimension(page) {
  const p=body(await pose(page));await click(page,p);await page.getByRole('button',{name:'Constraints',exact:true}).click();
  await page.getByRole('button',{name:'Radius / Diameter',exact:true}).click();
  await page.getByRole('button',{name:'OK',exact:true}).click();
  await page.getByRole('button',{name:'Constraints',exact:true}).click();
 }
 await scenario('driving Radius blocks body without losing selection or adding History',async()=>{
  const ctx=await setup(),{page}=ctx;await radiusDimension(page);const before=await pose(page),p=body(before);
  await drag(page,p,{x:p.ux*30,y:p.uy*30});assert.deepEqual((await pose(page)).points,before.points);
  assert.match(await page.locator('[data-sketch-arc-id]').getAttribute('class'),/is-geometry-selected/);
  // One undo removes the Dimension, proving the no-op added no transaction.
  await page.keyboard.press('Control+z');assert.equal(await page.locator('[data-dimension-id]').count(),0);return ctx;
 });
 for(const orientation of ['CW','CCW']) await scenario(`fixed Radius endpoint projects to 2R ${orientation}`,async()=>{
  const ctx=await setup({orientation}),{page}=ctx;await radiusDimension(page);const before=await pose(page),pivot=before.points[before.endId];
  // Away from the radial annotation corridor and into the visible viewport.
  const requested={x:pivot.x+before.radius*2.5,y:pivot.y};
  const moved=await drag(page,before.points[before.startId],{x:requested.x-before.points[before.startId].x,y:requested.y-before.points[before.startId].y},{steps:8});const after=await pose(page);
  const dx=before.points[before.startId].x+moved.delta.x-pivot.x,dy=before.points[before.startId].y+moved.delta.y-pivot.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
  assert.deepEqual(after.points[before.endId],pivot);close(after.radius,before.radius);
  pointClose(after.points[before.startId],{x:pivot.x+2*before.radius*ux,y:pivot.y+2*before.radius*uy});
  pointClose(after.points[before.centerId],{x:pivot.x+before.radius*ux,y:pivot.y+before.radius*uy});assert.equal(after.orientation,before.orientation);return ctx;
 });
 await scenario('fixed Radius center translates the whole Arc',async()=>{
  const ctx=await setup(),{page}=ctx;await radiusDimension(page);const before=await pose(page);
  const moved=await drag(page,before.points[before.centerId],{x:20,y:15}),delta=moved.delta;const after=await pose(page);close(after.radius,before.radius);
  for(const id of [before.centerId,before.startId,before.endId])pointClose(after.points[id],{x:before.points[id].x+delta.x,y:before.points[id].y+delta.y});return ctx;
 });
 await scenario('shared Line endpoint and Circle center follow Arc center translation',async()=>{
  const ctx=await setup(),{page}=ctx,before=await pose(page);
  await page.getByRole('button',{name:'Line',exact:true}).click();await click(page,before.points[before.startId]);await click(page,{x:180,y:0});
  await page.getByRole('button',{name:'Circle',exact:true}).click();await click(page,before.points[before.endId]);await click(page,{x:30,y:100});
  assert.equal(await page.locator('[data-sketch-point-id]').count(),4,'shared Arc/Circle center adds no point');
  const circleBefore=await page.locator('[data-sketch-circle-id]').evaluate(e=>({x:+e.getAttribute('cx'),y:+e.getAttribute('cy'),r:+e.getAttribute('r')}));
  const moved=await drag(page,before.points[before.centerId],{x:20,y:15}),delta=moved.delta;const after=await pose(page);
  for(const id of [before.centerId,before.startId,before.endId])pointClose(after.points[id],{x:before.points[id].x+delta.x,y:before.points[id].y+delta.y});
  const line=await page.locator('[data-sketch-line-id]').evaluate(e=>({x:+e.getAttribute('x1'),y:+e.getAttribute('y1'),y2:+e.getAttribute('y2')}));
  pointClose(line,after.points[before.startId]);close(line.y2,line.y);
  const circle=await page.locator('[data-sketch-circle-id]').evaluate(e=>({x:+e.getAttribute('cx'),y:+e.getAttribute('cy'),r:+e.getAttribute('r')}));
  pointClose(circle,{x:circleBefore.x+delta.x,y:circleBefore.y+delta.y});close(circle.r,circleBefore.r);return ctx;
 });
 await scenario('zoomed body drag preserves center and radial semantics',async()=>{
  const ctx=await setup(),{page}=ctx;await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  const before=await pose(page),p=body(before),preview=await drag(page,p,{x:p.ux*20,y:p.uy*20});const after=await pose(page);
  const c=before.points[before.centerId],len=Math.hypot(preview.down.x-c.x,preview.down.y-c.y);
   const amount=preview.delta.x*(preview.down.x-c.x)/len+preview.delta.y*(preview.down.y-c.y)/len;
   assert.deepEqual(after.points[before.centerId],c);close(after.radius,before.radius+amount);return ctx;
 });
 await scenario('lost pointer capture cancels a center preview without History',async()=>{
  const ctx=await setup(),{page}=ctx,before=await pose(page),p=before.points[before.centerId];
  await drag(page,p,{x:20,y:15},{release:false});
  const input=await page.evaluate(()=>window.arcBrowserInput);
  await page.locator('svg.drawing-svg').evaluate((svg,id)=>{
   window.arcBrowserLostCapture=false;svg.addEventListener('lostpointercapture',()=>{window.arcBrowserLostCapture=true;},{once:true});
   const captured=svg.hasPointerCapture(id);if(!captured)throw new Error('no captured pointer');svg.releasePointerCapture(id);
  },input.pointerId);
  // Chromium processes the pending capture change before the next pointer
  // event. Deliver a move and observe the real lostpointercapture event.
  await page.mouse.move(input.lastClient.x+1,input.lastClient.y);
  await page.waitForFunction(()=>window.arcBrowserLostCapture===true);
  await page.mouse.up();assert.deepEqual((await pose(page)).points,before.points);
  await page.keyboard.press('Control+z');assert.equal(await page.locator('[data-sketch-arc-id]').count(),0);return ctx;
 });
 await scenario('Circle center and body retain their ordinary manipulation',async()=>{
  const ctx=await setup(),{page}=ctx,beforeArc=await pose(page);
  await page.getByRole('button',{name:'Circle',exact:true}).click();await click(page,{x:-180,y:-100});await click(page,{x:-140,y:-100});
  const read=()=>page.locator('[data-sketch-circle-id]').evaluate(e=>({x:+e.getAttribute('cx'),y:+e.getAttribute('cy'),radius:+e.getAttribute('r')}));
  const before=await read(),moved=await drag(page,before,{x:20,y:15}),after=await read();
  pointClose(after,{x:before.x+moved.delta.x,y:before.y+moved.delta.y});close(after.radius,before.radius);
  const preview=await drag(page,{x:after.x+after.radius,y:after.y},{x:15,y:5}),resized=await read();
  pointClose(resized,after);close(resized.radius,after.radius+preview.delta.x,1e-4);
  const afterArc=await pose(page);for(const id of [beforeArc.startId,beforeArc.endId,beforeArc.centerId])assert.deepEqual(afterArc.points[id],beforeArc.points[id]);return ctx;
 });
 await scenario('Line body retains constrained translation and Undo',async()=>{
  const ctx=await setup(),{page}=ctx;await page.getByRole('button',{name:'Line',exact:true}).click();await click(page,{x:-180,y:-160});await click(page,{x:-80,y:-160});
  const read=()=>page.locator('[data-sketch-line-id]').evaluate(e=>({a:{x:+e.getAttribute('x1'),y:+e.getAttribute('y1')},b:{x:+e.getAttribute('x2'),y:+e.getAttribute('y2')}}));
  const before=await read(),p={x:(before.a.x+before.b.x)/2,y:before.a.y},moved=await drag(page,p,{x:20,y:15}),after=await read();
  for(const id of ['a','b'])pointClose(after[id],{x:before[id].x+moved.delta.x,y:before[id].y+moved.delta.y});
  await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);return ctx;
 });
 await browser.close();
 if(output)fs.writeFileSync(output,JSON.stringify(results,null,2));
 console.log(`${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);
 if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
})();

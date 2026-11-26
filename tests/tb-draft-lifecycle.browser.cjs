// Real toolbar/canvas/keyboard input; observation exposes only the production owner.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:1366,height:768}});
    page.setDefaultTimeout(6000);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route(/\/src\/app\/globalProjectHistory\.ts(?:\?.*)?$/,async route=>{
      const url=new URL(route.request().url());
      if(url.searchParams.has('observed')) return route.continue();
      url.searchParams.set('observed','1');
      await route.fulfill({contentType:'text/javascript',body:`
        import {createGlobalProjectHistory as create} from ${JSON.stringify(url.href)};
        export function createGlobalProjectHistory(...args) {
          const owner=create(...args), ids=new WeakMap(); let serial=0;
          const id=x=>{if(!ids.has(x)) ids.set(x,++serial); return ids.get(x);};
          const observe=()=>{
            const root=owner.getSnapshot(), tape=owner.getHistory(), box=root.box;
            const live=owner.getBoxScope().box;
            return {accepted:{root:id(root),history:id(tape),undo:id(tape.undo),redo:id(tape.redo),
              undoCount:tape.undo.length,redoCount:tape.redo.length,chronology:root.chronology,
              connections:box.connections,assignments:box.edgeAssignments,active:box.activeTBGroup,
              completed:box.completedTBGroups,order:box.workflowGroupOrder,output:id(box.generatedGeometrySnapshot)},
              draft:!!owner.getPublication().tbDraft,live:live.activeTBGroup,liveOutput:id(live.generatedGeometrySnapshot)};
          };
          return {...owner,subscribe(listener) { window.tbState=observe; return owner.subscribe(listener); }};
        }
      `});
    });
    const state=()=>page.evaluate(()=>window.tbState());
    const overlay=page.getByLabel('Active Tool overlay',{exact:true});
    const button=(root,name)=>root.getByRole('button',{name,exact:true});
    const tool=name=>button(page.getByLabel('Tool sidebar',{exact:true}),name).click();
    const action=name=>button(overlay.getByRole('group',{name:'Active workflow actions'}),name).click();
    const history=page.getByRole('complementary',{name:'Construction history'});
    const groups=history.getByRole('button',{name:/^TB Group/});
    const undo=button(page,'Undo (Ctrl+Z)'), redo=button(page,'Redo (Ctrl+Y)');
    const notice=page.locator('.notice:not(.inline-notice)');
    const contours=()=>page.locator('.final-contour-kerf-layer').innerHTML();
    const label=(id,n)=>button(overlay.locator('.label-list'),`${id} ${n} ${n===1?'edge':'edges'}`);
    async function edge(index) {
      const p=await page.locator('.edge-hitbox').nth(index).evaluate(el=>{
        const p=el.getPointAtLength(el.getTotalLength()/2).matrixTransform(el.getScreenCTM());
        return [p.x,p.y,document.elementFromPoint(p.x,p.y)===el];
      });
      assert.ok(p[2],`edge ${index} is reachable`);
      await page.mouse.click(p[0],p[1]);
    }
    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await page.getByLabel('Import SVG into BOX / Construction',{exact:true}).setInputFiles('tests/fixtures/construction-two-panels.svg');
    await button(page.getByRole('dialog'),'OK').click();
    await button(overlay,'Accept default thickness').click(); await action('Apply'); await action('OK');
    await tool('MFG');
    const kerf=page.locator('#manufacturing-kerf');
    await kerf.fill('0.42'); await kerf.press('Enter'); await undo.click();
    await page.keyboard.press('Escape');
    const original=(await state()).accepted, originalContours=await contours();
    assert.ok(original.redoCount>0);

    for(let i=0;i<3;i++) {
      await tool('TB'); assert.ok(await label('TB1',0).isVisible());
      assert.equal(await groups.count(),0);
      assert.deepEqual((await state()).accepted,original);
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      assert.deepEqual((await state()).accepted,original);
      assert.equal((await state()).draft,false);
      assert.equal(await groups.count(),0);
      assert.equal(await contours(),originalContours);
    }
    await tool('TB'); await edge(0);
    await action('OK');
    assert.match(await notice.innerText(),/one valid A edge and one valid B edge/);
    assert.equal((await state()).draft,true);
    assert.equal(await groups.count(),0);
    assert.deepEqual((await state()).accepted,original);
    await action('Apply'); assert.match(await notice.innerText(),/TB1 is incomplete/);
    assert.equal(await contours(),originalContours);
    await page.keyboard.press('Escape');
    assert.deepEqual((await state()).accepted,original);
    await redo.click(); assert.equal((await state()).accepted.redoCount,0);
    await undo.click();
    const baseline=(await state()).accepted;

    await tool('TB'); await edge(0); await edge(4);
    const firstId=(await state()).live.groupId;
    assert.ok(await label('TB2',0).isVisible()); assert.equal(await groups.count(),0);
    await action('OK');
    const finished=(await state()).accepted;
    assert.equal(finished.undoCount,baseline.undoCount+1);
    assert.equal(finished.redoCount,0);
    assert.deepEqual(finished.active,{groupId:firstId,connectionIds:['TB1'],isActive:false});
    assert.equal(finished.connections.TB2,undefined);
    assert.equal(finished.assignments['edge-1'].edgeAssignment.edgeRole,'A');
    assert.equal(finished.assignments['edge-5'].edgeAssignment.edgeRole,'B');
    assert.equal(await groups.count(),1);
    assert.equal(await contours(),originalContours,'Finish alone preserves manufacturing output');
    const rowId=await groups.first().getAttribute('data-operation-id');
    await groups.first().click(); await action('Apply');
    const applied=await contours(); assert.notEqual(applied,originalContours);
    await page.keyboard.press('Escape');
    let older=(await state()).accepted;
    await tool('TB'); await edge(1); await page.keyboard.press('Escape');
    assert.deepEqual((await state()).accepted,older);
    assert.equal(await groups.count(),1);
    assert.equal(await groups.first().getAttribute('data-operation-id'),rowId);
    assert.equal(await contours(),applied);
    await groups.first().click(); await page.keyboard.press('Escape');
    assert.equal(await groups.first().getAttribute('data-operation-id'),rowId);
    assert.equal(await contours(),applied);

    older=(await state()).accepted;
    await tool('TB'); await edge(1); await edge(7);
    await action('Apply');
    const staged=await state();
    assert.deepEqual(staged.accepted,older);
    assert.notEqual(staged.liveOutput,older.output);
    await page.keyboard.press('Escape');
    assert.deepEqual((await state()).accepted,older); assert.equal(await contours(),applied);
    await tool('TB'); await edge(1); await edge(7); await action('Apply');
    const stagedOutput=(await state()).liveOutput;
    await action('OK');
    const both=(await state()).accepted;
    assert.equal(both.output,stagedOutput); assert.equal(await groups.count(),2);
    assert.equal(both.chronology.filter(e=>e.kind==='TB')[0].id,rowId);
    await undo.click(); assert.deepEqual((await state()).accepted.connections,older.connections);
    assert.equal(await groups.count(),1); assert.equal((await state()).draft,false);
    await redo.click();
    const redone=(await state()).accepted;
    for(const key of ['root','output','undoCount','redoCount']) assert.equal(redone[key],both[key],key);
    assert.deepEqual(redone.chronology,both.chronology); assert.equal(await groups.count(),2);

    await tool('TB'); await edge(2);
    await button(page.getByRole('navigation',{name:'Main workspaces'}),'2D Drawing').click();
    await button(page.getByRole('navigation',{name:'Main workspaces'}),'Box / Construction').click();
    assert.equal((await state()).draft,false); assert.equal(await groups.count(),2);
    await tool('TB'); assert.ok(await label('TB3',0).isVisible());
    await page.keyboard.press('Escape');
    await tool('TB'); await edge(2);
    await page.getByLabel('Import SVG into BOX / Construction',{exact:true}).setInputFiles('tests/fixtures/construction-two-panels.svg');
    await button(page.getByRole('dialog'),'OK').click();
    assert.equal((await state()).draft,false);
    assert.equal((await state()).accepted.connections.TB3,undefined);
    assert.deepEqual(errors,[]);
    console.log('PASS Chromium TB empty/one-edge Escape, invalid Finish/Apply, stable History, accepted groups, staged Apply, global Undo/Redo/Redo preservation and navigation cancellation');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

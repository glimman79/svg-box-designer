// Observe identities at the real Vite module boundary. All actions use the mounted UI.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless:true, args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:960}});
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    const monitored = {svgUtils:['parseSvgDocument'], tbGeometry:['buildGeneratedTBGeometryItems'],
      wallGeometry:['buildGeneratedWGeometryItems'], sGeometry:['buildGeneratedSGeometryItems'],
      drawingConstraintSolver:['solveDrawingDimensionEdit'], generatedGeometryAuthority:['selectGeneratedGeometryAuthority'],
      generatedGeometrySnapshot:['createGeneratedGeometrySnapshot']};
    await page.route(/\/src\/(?:app\/)?(?:svgUtils|tbGeometry|wallGeometry|sGeometry|drawingConstraintSolver|generatedGeometryAuthority|generatedGeometrySnapshot)\.ts(?:\?.*)?$/, async route => {
      const url=new URL(route.request().url());
      if (url.searchParams.has('original')) return route.continue();
      url.searchParams.set('original','1');
      const specifier=JSON.stringify(url.href), name=url.pathname.split('/').pop().slice(0,-3);
      const wrappers=monitored[name].map(fn=>`export function ${fn}(...args) {
        const calls=window.pipelineCalls ||= {}; calls['${fn}']=(calls['${fn}'] || 0)+1;
        return impl.${fn}(...args);
      }`).join('\n');
      await route.fulfill({contentType:'text/javascript',body:`export * from ${specifier}; import * as impl from ${specifier}; ${wrappers}`});
    });
    const calls=()=>page.evaluate(()=>({...window.pipelineCalls}));
    await page.route(/\/src\/app\/globalProjectHistory\.ts(?:\?.*)?$/, async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('observed')) return route.continue();
      url.searchParams.set('observed','1');
      await route.fulfill({contentType:'text/javascript',body:`
        import { createGlobalProjectHistory as create } from ${JSON.stringify(url.href)};
        export function createGlobalProjectHistory() {
          const service = create(), ids = new WeakMap();
          let sequence = 0;
          const id = node => { if (!ids.has(node)) ids.set(node,++sequence); return ids.get(node); };
          const inspect = () => {
            const {current, undo, redo} = service.getHistory(), root = service.getSnapshot();
            if (current.drawingDocument !== root.drawingDocument ||
                Object.entries({...current.box.data,...current.box.context}).some(([key,value])=>root.box[key] !== value))
              throw Error('Owner and cursor have diverged');
            return { frame:id(current), root:id(root), output:id(root.box.generatedGeometrySnapshot),
              drawing:id(root.drawingDocument), undo:undo.length, redo:redo.length,
              label:undo.at(-1)?.transaction.label };
          };
          return {...service, subscribe(listener) {
            window.inspectHistory = inspect;
            return service.subscribe(() => { inspect(); listener(); });
          }};
        }
      `});
    });
    const state = () => page.evaluate(()=>window.inspectHistory());
    const button = name => page.getByRole('button',{name,exact:true});
    const navigate = name => button(name).click();
    const drawing = '2D Drawing', box = 'Box / Construction';
    const undo = button('Undo (Ctrl+Z)'), redo = button('Redo (Ctrl+Y)');
    const overlay = page.getByLabel('Active Tool overlay',{exact:true});
    const action = name => overlay.getByRole('button',{name,exact:true}).click();
    const tool = name => page.getByLabel('Tool sidebar',{exact:true}).getByRole('button',{name,exact:true}).click();
    const click = async (x,y) => {
      const point = await page.locator('svg.drawing-svg').evaluate((el,[x,y])=>{
        const p = new DOMPoint(x,y).matrixTransform(el.getScreenCTM()); return {x:p.x,y:p.y};
      },[x,y]);
      await page.mouse.click(point.x,point.y);
    };
    const line = async (y=-50,x=-120) => { await button('Line').click(); await click(x,y); await click(x+100,y); };
    const edge = async (index, hold=false) => {
      const p = await page.locator('.edge-hitbox').nth(index).evaluate(el=>{
        const x=(+el.getAttribute('x1') + +el.getAttribute('x2'))/2;
        const y=(+el.getAttribute('y1') + +el.getAttribute('y2'))/2;
        const p=new DOMPoint(x,y).matrixTransform(el.getScreenCTM()); return {x:p.x,y:p.y};
      });
      await page.mouse.move(p.x,p.y); await page.mouse.down(); if (!hold) await page.mouse.up();
    };
    const expectFrame = async (snapshot, workspace) => {
      const current = await state();
      assert.equal(current.frame,snapshot.frame);
      assert.equal(current.root,snapshot.root);
      assert.equal(await button(workspace).getAttribute('aria-pressed'),'true');
    };
    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await page.getByLabel('Import SVG into BOX / Construction',{exact:true}).setInputFiles('tests/fixtures/construction-two-panels.svg');
    await page.getByRole('dialog',{name:'Panel Manager'}).getByRole('button',{name:'OK'}).click();
    const imported = await state();
    await navigate(drawing); await button('Circle').click(); await click(60,30); await click(85,30);
    const circle = await state(); assert.equal(circle.label,'Create Circle');
    await navigate(box); await page.locator('#pm-panel-thickness-panel-1').fill('4');
    const thickness = await state(); assert.equal(thickness.label,'Edit panel thickness');
    await navigate(drawing); await undo.click(); await expectFrame(circle,box);
    await undo.click(); await expectFrame(imported,drawing);
    await redo.click(); await expectFrame(circle,drawing);
    await redo.click(); await expectFrame(thickness,box);
    await undo.click(); await navigate(drawing); await navigate(box); await redo.click(); await expectFrame(thickness,box);
    await undo.click(); await navigate(drawing); await line();
    assert.equal(await redo.isEnabled(),false);
    const baseLine = await state();
    await navigate(box); await action('Accept default thickness'); await action('Apply'); await action('OK');
    await tool('TB'); const group = await state(); await edge(0); const assigned = await state();
    await edge(4,true); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+y');
    await page.mouse.up(); await expectFrame(assigned,box);
    await navigate(drawing); await line(70); const secondLine = await state();
    await undo.click(); await expectFrame(assigned,drawing); await undo.click(); await expectFrame(group,box);
    await redo.click(); await expectFrame(assigned,box); await redo.click(); await expectFrame(secondLine,drawing);
    await navigate(box); await edge(4); await action('OK');
    await tool('W'); await edge(1); await edge(7); await action('OK');
    await tool('S'); await edge(2); await edge(6); await action('OK');
    const history = page.getByRole('complementary',{name:'Construction history'});
    await history.getByRole('button',{name:/^S Group 1,/}).click();
    const authored = await state(); await action('Apply'); const applied = await state();
    assert.notEqual(applied.output,authored.output,await page.locator('.notice:not(.inline-notice)').allTextContents().then(messages => messages.join(' ')));
    await action('Apply'); assert.deepEqual(await state(),applied,'repeated Apply is semantically unchanged');
    await navigate(drawing); await button('Dimension').focus(); await page.keyboard.press('Enter');
    await click(-70,-50); await click(-70,-100);
    const dimension = await state(); assert.equal(dimension.label,'Create Dimension');
    await page.locator('.drawing-dimension-value-hit').dblclick();
    const input=page.getByRole('textbox',{name:'Dimension value in millimetres',exact:true});
    await input.fill('120'); await input.press('Control+z'); assert.deepEqual(await state(),dimension);
    await input.fill('120'); await input.press('Enter');
    const solved=await state(); assert.equal(solved.label,'Edit Dimension'); assert.notEqual(solved.drawing,baseLine.drawing);
    const appliedCalls=await calls();
    for(const name of Object.values(monitored).flat()) assert.ok(appliedCalls[name]>0,name+' exercised before restore');
    await undo.click(); await expectFrame(dimension,drawing); await undo.click(); await expectFrame(applied,drawing);
    await undo.click(); await expectFrame(authored,box);
    await history.getByRole('button',{name:/^TB Group 1,/}).click();
    await history.getByRole('button',{name:/^W Group 1,/}).click();
    await navigate(drawing); await redo.click(); await expectFrame(applied,box);
    await redo.click(); await expectFrame(dimension,drawing); await redo.click(); await expectFrame(solved,drawing);
    assert.equal((await state()).output,applied.output);
    assert.deepEqual(await calls(),appliedCalls,'traversal and navigation call no solver, parser, generator or authority selector');
    await navigate(box);
    await page.getByLabel('Import SVG into BOX / Construction',{exact:true}).setInputFiles({
      name:'replacement.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="70" height="50"/></svg>')});
    await page.getByRole('dialog',{name:'Panel Manager'}).getByRole('button',{name:'OK'}).click();
    const replacement=await state(), replacedCalls=await calls();
    assert.equal(replacement.label,'Import SVG source'); assert.notEqual(replacement.output,applied.output);
    await undo.click(); await expectFrame(solved,box); await redo.click(); await expectFrame(replacement,box);
    await undo.click(); await expectFrame(solved,box);
    assert.deepEqual(await calls(),replacedCalls,'source replacement traverses exact stored records');

    // Alternate real edits past capacity, recording identity without retaining frames.
    await navigate(box); await history.getByRole('button',{name:/^Panel Manager,/}).click();
    const tape = [await state()];
    for (let i=0;i<17;i++) {
      await navigate(drawing); await page.keyboard.down('Control'); await line(-190+i*18,75); await page.keyboard.up('Control');
      const placed=await state(); assert.equal(placed.label,'Create Line','placement '+i); assert.notEqual(placed.frame,tape.at(-1).frame);
      tape.push(placed);
      await navigate(box); await page.locator('#pm-panel-thickness-panel-1').fill(String(5+i));
      const changed=await state(); assert.equal(changed.label,'Edit panel thickness','thickness '+i); tape.push(changed);
    }
    assert.equal(tape.at(-1).undo,30); assert.equal(tape.at(-1).redo,0);
    for (let i=34;i>4;i--) {
      await undo.click(); await expectFrame(tape[i-1], i%2===0 ? box : drawing);
    }
    assert.equal(await undo.isEnabled(),false);
    for (let i=5;i<=10;i++) { await redo.click(); await expectFrame(tape[i],i%2===0 ? box : drawing); }
    await navigate(drawing); await line(175);
    assert.equal((await state()).undo,7); assert.equal(await redo.isEnabled(),false);
    await navigate(box); const beforeClear=await state();
    await button('Clear').click();
    const confirmation=page.getByRole('dialog',{name:'Clear BOX / Construction?'});
    assert.match(await confirmation.innerText(),/entire Undo\/Redo history, including Drawing/);
    await confirmation.getByRole('button',{name:'Cancel'}).click(); assert.deepEqual(await state(),beforeClear);
    await button('Clear').click(); await confirmation.getByRole('button',{name:'Clear',exact:true}).click();
    assert.equal((await state()).drawing,beforeClear.drawing); assert.equal((await state()).undo,0); assert.equal((await state()).redo,0);
    await navigate(drawing); await button('Profile').click();
    await click(-140,135); await click(-70,130);
    await undo.click(); assert.equal((await state()).drawing,beforeClear.drawing);
    await page.waitForTimeout(260); assert.equal((await state()).redo,1);
    await redo.click(); assert.equal((await state()).label,'Create Profile segment');
    await button('Profile').click(); await click(50,140); await click(100,150);
    await navigate(box); const settled=await state();
    assert.equal(settled.label,'Create Profile segment'); await page.waitForTimeout(260); assert.deepEqual(await state(),settled);
    await navigate(drawing);
    const p=await page.locator('svg.drawing-svg').evaluate(el=>{
      const p=new DOMPoint(145,175).matrixTransform(el.getScreenCTM()); return {x:p.x,y:p.y};
    });
    // Verified against the #642 Chromium baseline: the first click completes
    // one final segment and native dblclick finishes the tool without a duplicate.
    await page.mouse.dblclick(p.x,p.y); await page.waitForTimeout(260);
    assert.equal((await state()).undo,settled.undo+1);
    assert.equal(await button('Profile').getAttribute('aria-pressed'),'false');
    await undo.click(); await expectFrame(settled,drawing);
    assert.deepEqual(errors,[]);
    console.log('PASS mounted global A/B/C/D/E/I/J: frame and root identity, mixed Apply and solved Dimension, exact 30-action eviction, branch, Clear');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

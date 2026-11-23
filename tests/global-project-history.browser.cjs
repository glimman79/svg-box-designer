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
          const service = create(), ids = new WeakMap(), boundSketches = new WeakMap();
          let sequence = 0;
          const id = node => { if (!ids.has(node)) ids.set(node,++sequence); return ids.get(node); };
          const inspect = () => {
            const {current, undo, redo} = service.getHistory(), root = service.getSnapshot();
            const ops = root.constructionOperations;
            if (current.constructionOperations !== ops || ops.length !== 1 ||
                ops[0].sketchId !== root.drawingDocument.activeSketchId ||
                !root.drawingDocument.sketches[ops[0].sketchId] || current.drawingDocument !== root.drawingDocument ||
                Object.entries({...current.box.data,...current.box.context}).some(([key,value])=>root.box[key] !== value))
              throw Error('Owner and cursor have diverged');
            const sketch = root.drawingDocument.sketches[ops[0].sketchId];
            if (boundSketches.has(ops[0]) && boundSketches.get(ops[0]) !== sketch)
              throw Error('Published operation still describes the previous Sketch');
            boundSketches.set(ops[0], sketch);
            const {session,revision,epoch,history,activeWorkspace} = service.getPublication();
            return { activeWorkspace, session:id(session), revision, epoch, history:id(history), frame:id(current), root:id(root), output:id(root.box.generatedGeometrySnapshot),
              operations:id(ops), operationId:ops[0].id, definition:ops[0].definitionRevision,
              drawing:id(root.drawingDocument), undo:undo.length, redo:redo.length,
              action:undo.at(-1)?.transaction, label:undo.at(-1)?.transaction.label };
          };
          return {...service, subscribe(listener) {
            window.inspectHistory = inspect;
            window.readProject = service.getSnapshot;
            window.resetProjectForImportTest = service.clearProject;
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
      assert.equal(current.operations,snapshot.operations);
      assert.equal(current.definition,snapshot.definition);
      assert.equal(current.activeWorkspace,workspace === box ? 'construction' : 'drawing');
      assert.equal(await button(workspace).getAttribute('aria-pressed'),'true');
    };
    await page.goto(process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/');
    await page.waitForFunction(() => !!window.readProject);
    // Issue consecutive commands in one browser task, with no wait between events.
    const initialPosition = await state();
    const rapid = await page.evaluate(() => {
      const [drawing, box, puzzle] = document.querySelectorAll('.workspace-selector button');
      const seen = [];
      for (const target of [drawing, box, drawing, drawing, puzzle]) {
        target.click(); seen.push(window.inspectHistory());
      }
      for (const command of document.querySelectorAll('.history-commands button')) {
        command.click();
        seen.push(window.inspectHistory());
      }
      return seen;
    });
    assert.deepEqual(rapid.map(p => [p.activeWorkspace,p.undo,p.redo]), [
      ['drawing',1,0], ['construction',2,0], ['drawing',3,0], ['drawing',3,0],
      ['drawing',3,0], ['construction',2,1], ['drawing',3,0],
    ]);
    for (const p of rapid) assert.equal(p.root,initialPosition.root);
    await expectFrame(initialPosition,drawing);
    await undo.click(); await undo.click(); await undo.click();
    await expectFrame(initialPosition,box);
    const initial = await page.evaluate(() => window.readProject());
    await page.getByLabel('Import SVG into BOX / Construction',{exact:true}).setInputFiles('tests/fixtures/construction-two-panels.svg');
    await page.getByRole('dialog',{name:'Panel Manager'}).getByRole('button',{name:'OK'}).click();
    const imported = await state();
    await navigate(drawing); await button('Circle').click(); await click(60,30); await click(85,30);
    const circle = await state(); assert.equal(circle.label,'Create Circle');
    await navigate(box); await page.locator('#pm-panel-thickness-panel-1').fill('4');
    const thickness = await state(); assert.equal(thickness.label,'Edit panel thickness');
    await navigate(drawing); await undo.click(); await expectFrame(thickness,box);
    await undo.click(); await expectFrame(circle,box);
    await undo.click(); await expectFrame(circle,drawing);
    await undo.click(); await expectFrame(imported,drawing);
    await redo.click(); await expectFrame(circle,drawing);
    await redo.click(); await expectFrame(circle,box);
    await redo.click(); await expectFrame(thickness,box);
    await undo.click(); await navigate(box); assert.ok(await redo.isEnabled());
    await navigate(drawing); assert.ok(await redo.isDisabled());
    await navigate(box); await undo.click(); await expectFrame(circle,drawing);
    await line();
    assert.equal(await redo.isEnabled(),false);
    const baseLine = await state();
    await navigate(box); await action('Accept default thickness'); await action('Apply'); await action('OK');
    // Start TB immediately after navigation in the same call stack.
    await navigate(drawing);
    const sameEvent = await page.evaluate(() => {
      document.querySelectorAll('.workspace-selector button')[1].click();
      for (const key of ['z','y']) window.dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:true,bubbles:true}));
      const switched = window.inspectHistory();
      [...document.querySelectorAll('.tool-sidebar button')].find(b => b.textContent.trim() === 'TB').click();
      return [switched, window.inspectHistory()];
    });
    assert.equal(sameEvent[1].undo,sameEvent[0].undo+1);
    const group = await state(); assert.equal(group.activeWorkspace,'construction');
    assert.equal(group.action.kind,'edit'); assert.equal(group.action.module,'box');
    await edge(0); const assigned = await state();
    await edge(4,true); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+y');
    await page.mouse.up(); await expectFrame(assigned,box);
    await navigate(drawing); await line(70); const secondLine = await state();
    await undo.click(); await expectFrame(assigned,drawing); await undo.click(); await expectFrame(assigned,box);
    await undo.click(); await expectFrame(group,box);
    await redo.click(); await expectFrame(assigned,box); await redo.click(); await expectFrame(assigned,drawing);
    await redo.click(); await expectFrame(secondLine,drawing);
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
    assert.equal(circle.operationId, initialPosition.operationId);
    assert.equal(solved.operationId, circle.operationId);
    assert.notEqual(circle.definition, initialPosition.definition);
    assert.notEqual(solved.definition, dimension.definition);
    const appliedCalls=await calls();
    for(const name of Object.values(monitored).flat()) assert.ok(appliedCalls[name]>0,name+' exercised before restore');
    await undo.click(); await expectFrame(dimension,drawing); await undo.click(); await expectFrame(applied,drawing);
    await undo.click(); await expectFrame(applied,box);
    await undo.click(); await expectFrame(authored,box);
    await history.getByRole('button',{name:/^TB Group 1,/}).click();
    await history.getByRole('button',{name:/^W Group 1,/}).click();
    await redo.click(); await expectFrame(applied,box);
    await redo.click(); await expectFrame(applied,drawing);
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
      await navigate(drawing); tape.push(await state());
      await page.keyboard.down('Control'); await line(-190+i*18,75); await page.keyboard.up('Control');
      const placed=await state(); assert.equal(placed.label,'Create Line','placement '+i); assert.notEqual(placed.frame,tape.at(-1).frame);
      tape.push(placed);
      await navigate(box); tape.push(await state());
      await page.locator('#pm-panel-thickness-panel-1').fill(String(5+i));
      const changed=await state(); assert.equal(changed.label,'Edit panel thickness','thickness '+i); tape.push(changed);
    }
    assert.equal(tape.at(-1).undo,30); assert.equal(tape.at(-1).redo,0);
    const workspaceAt = i => tape[i].activeWorkspace === 'drawing' ? drawing : box;
    for (let i=68;i>38;i--) {
      await undo.click(); await expectFrame(tape[i-1],workspaceAt(i-1));
    }
    assert.equal(await undo.isEnabled(),false);
    for (let i=39;i<=68;i++) { await redo.click(); await expectFrame(tape[i],workspaceAt(i)); }
    for (let i=68;i>44;i--) await undo.click();
    const fork = await state();
    await navigate(drawing);
    assert.equal((await state()).undo,fork.undo+1); assert.ok(await redo.isDisabled());
    await line(175);
    assert.equal((await state()).undo,fork.undo+2);
    const branched = await state();
    await undo.click();
    const beforeCancel = await state();
    assert.equal(beforeCancel.redo, 1);
    const clear = button('Clear');
    const confirmation = page.getByRole('dialog', {name:'Clear entire project?', exact:true});
    const dialogClosed = () => page.locator('dialog.project-clear-dialog').waitFor({state:'detached'});
    const cancel = confirmation.getByRole('button', {name:'Cancel', exact:true});
    const discard = confirmation.getByRole('button', {name:'Clear Without Saving', exact:true});
    const save = confirmation.getByRole('button', {name:'Save and Clear', exact:true});
    let downloads = 0;
    page.on('download', () => downloads++);
    await clear.click();
    assert.match(await confirmation.innerText(), /Saving an editable project is not available yet/);
    assert.equal(await confirmation.evaluate(el => el.matches(':modal')), true);
    assert.equal(await cancel.evaluate(el => el === document.activeElement), true);
    assert.equal(await save.isVisible(), true);
    assert.equal(await save.isDisabled(), true);
    const bounds = await save.boundingBox();
    await page.mouse.click(bounds.x + bounds.width/2, bounds.y + bounds.height/2);
    await save.evaluate(el => { el.focus(); el.click(); });
    assert.equal(await save.evaluate(el => el === document.activeElement), false);
    await cancel.focus(); await page.keyboard.press('Tab');
    assert.equal(await discard.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await cancel.evaluate(el => el === document.activeElement), true);
    for (const key of ['Control+z','Control+y','Delete']) await page.keyboard.press(key);
    assert.deepEqual(await state(), beforeCancel);
    assert.equal(await confirmation.isVisible(), true);
    assert.doesNotMatch(await confirmation.innerText(), /successfully saved|project (?:was )?saved/i);
    assert.equal(downloads, 0);
    await cancel.press('Enter');
    await dialogClosed();
    assert.deepEqual(await state(), beforeCancel);
    assert.equal(await clear.evaluate(el => el === document.activeElement), true);
    for (const dismiss of [() => page.keyboard.press('Escape'), () => page.mouse.click(5,5)]) {
      await clear.click(); await dismiss(); await dialogClosed();
      assert.deepEqual(await state(), beforeCancel);
    }
    await redo.click(); await expectFrame(branched,drawing);

    // Keep the full mixed manufacturing project, including both kinds of Drawing geometry.
    const populated = await page.evaluate(() => window.readProject());
    assert.ok(populated.box.panelManager.isDirty, 'pending PM settings coexist with previously applied output');
    assert.ok(populated.box.generatedGeometrySnapshot.generatedGeometry.length > 0);
    for (const prefix of ['TB','W','S']) assert.ok(Object.keys(populated.box.connections).some(id => id.startsWith(prefix)));
    const entities = Object.values(populated.drawingDocument.sketches).flatMap(sketch => Object.values(sketch.entities));
    for (const type of ['line','circle']) assert.ok(entities.some(entity => entity.type === type));

    // Hold an already accepted Profile timer and deliver it even after its timeout is cancelled.
    await page.evaluate(() => {
      const schedule = window.setTimeout.bind(window);
      window.profileCallbacks = [];
      window.setTimeout = (fn, delay, ...args) => {
        if (delay !== 220) return schedule(fn, delay, ...args);
        window.profileCallbacks.push(fn);
        return schedule(fn, 60000, ...args);
      };
      window.restoreTimers = () => { window.setTimeout = schedule; };
    });
    await button('Profile').click(); await click(-140,135); await click(-70,130);
    assert.equal(await page.evaluate(() => window.profileCallbacks.length), 2, 'both Profile placements were accepted');
    const beforePrompt = await state();
    await clear.click();
    await page.evaluate(() => window.profileCallbacks.forEach(fn => fn()));
    assert.deepEqual(await state(), beforePrompt, 'queued Profile callbacks cannot publish in the dialog');
    await cancel.click(); await dialogClosed();
    assert.deepEqual(await state(), beforePrompt);
    assert.equal(await page.evaluate(() => window.profileCallbacks.length), 3, 'Cancel rescheduled the pending Profile click');
    await page.evaluate(() => window.profileCallbacks.at(-1)());
    assert.equal((await state()).label, 'Create Profile segment', 'Cancel resumes the accepted click');
    await click(-40,160);
    const beforeClear = await state();
    await clear.click();
    await discard.press('Enter');
    await dialogClosed();
    await page.evaluate(() => { window.profileCallbacks.forEach(fn => fn()); window.restoreTimers(); });
    const empty = await state();
    assert.equal(empty.revision, beforeClear.revision + 1, 'Clear never settles an extra edit');
    assert.notEqual(empty.session, beforeClear.session);
    assert.equal(empty.epoch, beforeClear.epoch + 1);
    const cleared = await page.evaluate(() => window.readProject());
    // Each canonical factory call timestamps its empty manufacturing snapshot.
    assert.ok(Number.isFinite(Date.parse(cleared.box.generatedGeometrySnapshot.metadata.createdTimestamp)));
    initial.box.generatedGeometrySnapshot.metadata.createdTimestamp = cleared.box.generatedGeometrySnapshot.metadata.createdTimestamp;
    assert.notEqual(cleared.constructionOperations[0].id, initial.constructionOperations[0].id);
    assert.notEqual(cleared.constructionOperations[0].definitionRevision, initial.constructionOperations[0].definitionRevision);
    assert.deepEqual(cleared, { ...initial, constructionOperations: [{ ...initial.constructionOperations[0],
      id: cleared.constructionOperations[0].id, definitionRevision: cleared.constructionOperations[0].definitionRevision }] });
    assert.equal(await button(box).getAttribute('aria-pressed'), 'true');
    assert.equal(await undo.isDisabled(), true); assert.equal(await redo.isDisabled(), true);
    assert.equal(await clear.evaluate(el => el === document.activeElement), true);
    await navigate(drawing); await navigate(box);
    for (const [command, workspace] of [[undo,drawing],[undo,box],[redo,drawing],[redo,box]]) {
      await command.click(); await expectFrame(empty,workspace);
    }
    await undo.click(); await undo.click(); assert.ok(await undo.isDisabled());
    await navigate(drawing);
    assert.equal(await page.locator('[data-sketch-line-id], [data-sketch-circle-id]').count(), 0);
    assert.equal(await page.locator('.edge-hitbox').count(), 0);

    // A genuinely new mixed timeline reaches the new baseline, including across SVG replacement.
    await line(); const freshLine = await state();
    await undo.click(); await expectFrame(empty,drawing);
    await redo.click(); await expectFrame(freshLine,drawing);
    await navigate(box);
    await page.getByLabel('Import SVG into BOX / Construction',{exact:true}).setInputFiles('tests/fixtures/construction-two-panels.svg');
    await page.getByRole('dialog',{name:'Panel Manager'}).getByRole('button',{name:'OK'}).click();
    const newImport = await state();
    await action('Accept default thickness');
    const newBoxEdit = await state();
    await action('Apply'); const newPM = await state(); await action('OK');
    await tool('TB'); const freshGroup = await state();
    await edge(0); const firstEdge = await state();
    await edge(4); const pair = await state();
    await undo.click(); await expectFrame(firstEdge,box);
    await undo.click(); await expectFrame(freshGroup,box);
    await undo.click(); await expectFrame(newPM,box);
    await undo.click(); await expectFrame(newBoxEdit,box);
    await undo.click(); await expectFrame(newImport,box);
    await undo.click(); await expectFrame(freshLine,box);
    await undo.click(); await expectFrame(freshLine,drawing);
    assert.equal(await page.locator('[data-sketch-line-id]').count(),1);
    await undo.click(); await expectFrame(empty,drawing);
    assert.equal(await page.locator('[data-sketch-line-id]').count(),0);
    await undo.click(); await expectFrame(empty,box); assert.ok(await undo.isDisabled());
    for (const [snapshot,workspace] of [[empty,drawing],[freshLine,drawing],[freshLine,box],[newImport,box],
      [newBoxEdit,box],[newPM,box],[freshGroup,box],[firstEdge,box],[pair,box]]) {
      await redo.click(); await expectFrame(snapshot,workspace);
    }

    // Opening the dialog from an uncommitted numeric draft must not accept its blur.
    await tool('MFG');
    const kerf = page.locator('#manufacturing-kerf');
    await kerf.fill('0.73');
    const draftPosition = await state();
    await clear.click();
    assert.deepEqual(await state(), draftPosition);
    await cancel.click(); await dialogClosed();
    assert.deepEqual(await state(), draftPosition);
    assert.equal(await kerf.inputValue(), '0.73');
    assert.equal(await kerf.evaluate(el => el === document.activeElement), true);
    await kerf.evaluate(el => { window.oldKerf = el; });
    await clear.click(); await discard.click(); await dialogClosed();
    const afterDraftClear = await state();
    assert.equal(afterDraftClear.revision, draftPosition.revision + 1);
    await page.evaluate(() => window.oldKerf.dispatchEvent(new FocusEvent('focusout', {bubbles:true})));
    assert.deepEqual(await state(), afterDraftClear);

    // Reset a captured Drawing drag while the physical mouse is still down.
    await navigate(drawing); await line(); await button('Select').click();
    const dragPoint = await page.locator('svg.drawing-svg').evaluate(el => {
      const p = new DOMPoint(-120,-50).matrixTransform(el.getScreenCTM()); return {x:p.x,y:p.y};
    });
    const holdDrag = async () => {
      await page.mouse.move(dragPoint.x, dragPoint.y); await page.mouse.down();
      await page.mouse.move(dragPoint.x+25, dragPoint.y-30, {steps:4});
      assert.equal(await page.locator('svg.drawing-svg').evaluate(el => el.hasPointerCapture(1)), true);
    };
    await holdDrag();
    const beforeSwitch = await state();
    await button(box).press('Enter');
    await page.mouse.up();
    assert.equal((await state()).undo,beforeSwitch.undo+1);
    await undo.click(); await expectFrame(beforeSwitch,drawing);
    assert.ok(await redo.isEnabled(),'late pointer release preserved Redo');
    await holdDrag();
    const beforeRelease = await state();
    await clear.press('Enter'); await page.mouse.up();
    assert.deepEqual(await state(), beforeRelease, 'captured pointer release cannot edit behind the prompt');
    await cancel.click(); await dialogClosed();
    assert.deepEqual(await state(), beforeRelease);
    await holdDrag(); await clear.press('Enter'); await discard.press('Space');
    await dialogClosed();
    const afterDragClear = await state();
    await page.mouse.up(); await navigate(drawing);
    assert.equal(afterDragClear.undo, 0); assert.equal(afterDragClear.redo, 0);
    await expectFrame(afterDragClear,drawing);
    assert.equal((await state()).undo,1);
    assert.equal(await page.locator('[data-sketch-line-id]').count(), 0);
    await button('Profile').click();
    await click(-140,135); await click(-70,130);
    await undo.click(); assert.equal((await state()).drawing,afterDragClear.drawing);
    await page.waitForTimeout(260); assert.equal((await state()).redo,1);
    await redo.click(); assert.equal((await state()).label,'Create Profile segment');
    const previousProfile = await state();
    await button('Profile').click(); await click(50,140); await click(100,150);
    await navigate(box); const settled=await state();
    assert.deepEqual(settled.action,{kind:'navigation',source:'drawing',destination:'construction'});
    assert.equal(settled.undo,previousProfile.undo+2);
    await page.waitForTimeout(260); assert.deepEqual(await state(),settled);
    await undo.click(); await expectFrame(settled,drawing);
    assert.equal((await state()).label,'Create Profile segment');
    await undo.click(); await expectFrame(previousProfile,drawing);
    await redo.click(); await expectFrame(settled,drawing);
    await button('Profile').click(); await click(100,150);
    const beforeDouble = await state();
    const p=await page.locator('svg.drawing-svg').evaluate(el=>{
      const p=new DOMPoint(145,175).matrixTransform(el.getScreenCTM()); return {x:p.x,y:p.y};
    });
    // Verified against the #642 Chromium baseline: the first click completes
    // one final segment and native dblclick finishes the tool without a duplicate.
    await page.mouse.dblclick(p.x,p.y); await page.waitForTimeout(260);
    assert.equal((await state()).undo,beforeDouble.undo+1);
    assert.equal(await button('Profile').getAttribute('aria-pressed'),'false');
    await undo.click(); await expectFrame(settled,drawing);
    await button('Profile').click(); await click(-15,130); await click(-15,130);
    const beforeInvalid = await state();
    assert.equal(beforeInvalid.drawing,settled.drawing);
    await navigate(box);
    assert.equal((await state()).undo,beforeInvalid.undo+1,'zero-length Profile creates only navigation');
    await undo.click(); await expectFrame(beforeInvalid,drawing);
    // The modal normally prevents Clear during import. Exercise the same service reset
    // during a real file read, then deliver that read while the next session owns its lock.
    await navigate(box);
    const fileInput = page.locator('input[type=file]');
    await fileInput.setInputFiles({name:'invalid.svg', mimeType:'image/svg+xml', buffer:Buffer.from('<broken>')});
    const notice = page.locator('.notice:not(.inline-notice)');
    await notice.waitFor();
    assert.match(await notice.innerText(), /not a valid SVG/);
    await page.evaluate(() => {
      const read = File.prototype.text;
      window.reads = [];
      File.prototype.text = function () {
        return new Promise(resolve => window.reads.push(async () => resolve(await read.call(this))));
      };
    });
    const importing = page.getByRole('dialog', {name:'Importing SVG…'});
    await fileInput.setInputFiles('tests/fixtures/construction-two-panels.svg'); await importing.waitFor();
    await page.evaluate(() => window.resetProjectForImportTest()); await importing.waitFor({state:'hidden'});
    const afterImportReset = await state();
    assert.equal(await notice.count(), 0);
    await fileInput.setInputFiles('tests/fixtures/06_two_independent_panels.svg'); await importing.waitFor();
    await page.evaluate(() => window.reads[0]());
    assert.deepEqual(await state(), afterImportReset);
    assert.equal(await importing.isVisible(), true);
    await page.evaluate(() => window.reads[1]());
    await page.getByRole('dialog', {name:'Panel Manager'}).waitFor();
    assert.equal((await state()).undo, 1);
    assert.equal((await state()).label, 'Import SVG source');
    assert.deepEqual(errors,[]);
    console.log('PASS mounted global history A–I: Line/navigation/SVG/TB round trip, same-task commands, mixed retention, Apply, Dimension, Profile, Clear and stale input');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

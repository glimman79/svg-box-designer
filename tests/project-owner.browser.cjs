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
    for(const name of ['TB','W','S']){
      await page.goto(process.env.WORKSPACE_BROWSER_URL||'http://127.0.0.1:5173/');
      await page.getByLabel('Import SVG into BOX / Construction',{exact:true}).setInputFiles('tests/fixtures/construction-two-panels.svg');
      const importSummary = page.getByRole('dialog',{name:'Panel Manager',exact:true});
      if (name === 'TB') {
        await importSummary.getByText('Panel count: 2',{exact:true}).waitFor();
        await page.keyboard.press('Escape');
        await importSummary.waitFor({state:'hidden'});
        assert.equal(await tool('Panel Manager').getAttribute('aria-pressed'),'true');
        assert.ok(await overlay.getByRole('heading',{name:'Panel Manager',exact:true}).isVisible());
      } else {
        await importSummary.getByRole('button',{name:'OK',exact:true}).click();
      }
      await action('Accept default thickness').click();
      await edit('#pm-panel-thickness-panel-1','4');
      await action('Apply').click();await action('OK').click();
      if (name === 'TB') {
        const pmEntry = history.getByRole('button',{name:'Panel Manager, opens Panel Manager panel',exact:true});
        const pmHeading = overlay.getByRole('heading',{name:'Panel Manager',exact:true});
        const acceptedState = async () => ({
          geometry: await contours(),
          sourceId: await page.locator('.edge-overlays').getAttribute('data-source-id'),
          historyIds: await history.locator('[data-operation-id]').evaluateAll(entries => entries.map(entry => entry.dataset.operationId)),
          constructionUnlocked: await tool('TB').isEnabled(),
          canUndo: await undo().isEnabled(),
          canRedo: await redo().isEnabled(),
        });
        const panelMetadata = () => overlay.getByLabel('Panels (2)',{exact:true}).locator('li').evaluateAll(panels => panels.map(panel => ({
          name: panel.querySelector('button').textContent,
          id: panel.querySelector('input').id,
          thickness: panel.querySelector('input').value,
        })));
        const accepted = await acceptedState();
        assert.match(accepted.geometry,/<path/);
        assert.equal(accepted.sourceId,'imported-svg');
        assert.equal(accepted.constructionUnlocked,true);
        assert.equal(accepted.canUndo,true);
        assert.equal(accepted.canRedo,false);
        await pmEntry.click();
        assert.ok(await pmHeading.isVisible());
        assert.ok(await action('Apply').isDisabled());
        assert.ok(await action('OK').isEnabled());
        const panels = await panelMetadata();
        assert.equal(panels.length,2);
        assert.equal(panels[0].thickness,'4');

        for (let press = 0; press < 2; press++) {
          await page.keyboard.press('Escape');
          assert.equal(await tool('Select').getAttribute('aria-pressed'),'true');
          assert.equal(await overlay.count(),0);
          assert.deepEqual(await acceptedState(),accepted);
        }

        await pmEntry.click();
        assert.ok(await action('Apply').isDisabled());
        assert.ok(await action('OK').isEnabled());
        assert.deepEqual(await panelMetadata(),panels);
        console.log('PASS Escape dismisses the import summary, then exits approved Panel Manager from History without changing accepted state');
      }
      await tool(name).click();await edge(0);await edge(4);
      const input=name==='S'?'#compact-slot-tab-size':'#compact-edge-tab-size';
      await edit(input,name==='S'?'15':'10');
      if(name==='S') await edit('#compact-slot-offset','5');
      await action('Apply').click();assert.equal(await page.locator('.notice:not(.inline-notice)').count(),0);
      const output=await contours();assert.match(output,/<path/);
      await action('OK').click();
      await undo().click();await history.getByRole('button',{name:new RegExp(`^${name} Group 1$`)}).click();
      assert.equal(await action('OK').count(),1,'Undo reopens the authored workflow');
      await redo().click();assert.equal(await action('OK').count(),0,'Redo restores completed state');assert.equal(await contours(),output);
      const first = history.getByRole('button',{name:name+' Group 1',exact:true});
      const firstId = await first.getAttribute('data-operation-id');
      await tool(name).click(); await edge(2);
      const later = history.getByRole('button',{name:name+' Group 2',exact:true});
      const laterId = await later.getAttribute('data-operation-id');
      assert.notEqual(laterId,firstId);
      await undo().click(); // Redo holds the first assignment in the second group.
      await first.click();
      assert.equal(await overlay.locator('.active-label-card strong').innerText(),name+'1');
      assert.ok(await overlay.getByText(name+'1',{exact:true}).count() >= 1);
      assert.equal(await overlay.locator('.label-list').getByText(name+'2',{exact:true}).count(),0);
      await action('OK').click();
      assert.equal(await tool('Select').getAttribute('aria-pressed'),'true');
      assert.ok(await redo().isEnabled());
      await redo().click();
      assert.equal(await later.getAttribute('data-operation-id'),laterId);
      await later.click(); await edge(2); // Inspect the already accepted edge.
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      assert.equal(await overlay.count(),0);
      await tool(name).click(); // Explicitly resume the existing active group.
      assert.ok(await overlay.getByRole('button',{name:name+'2 1 edge',exact:true}).isVisible());
      await first.click(); await page.keyboard.press('Escape');
      assert.equal(await overlay.count(),0);
      assert.equal(await first.getAttribute('data-operation-id'),firstId);
      await undo().click(); assert.equal(await later.count(),0,'inspection/OK/Escape add zero Undo steps');
      await undo().click(); // Return to the state before the second session.
      assert.equal(await contours(),output);
      await tool('MFG').click();await edit('#manufacturing-kerf','0.25');await action('Apply').click();
      assert.notEqual(await contours(),output);await undo().click();assert.notEqual(await contours(),output);
      await undo().click();assert.equal(await contours(),output);
      await redo().click();assert.notEqual(await contours(),output);
      await undo().click();
      const kerf=page.locator('#manufacturing-kerf');
      const previousKerf=await kerf.inputValue();
      await kerf.fill('0.42');await kerf.press('Escape');
      assert.equal(await kerf.inputValue(),previousKerf);
      await kerf.fill(previousKerf+'0');await kerf.press('Enter');
      assert.equal(await redo().isEnabled(),true,'cancel and equivalent normalized commit preserve Redo');
      await redo().click();assert.equal(await kerf.inputValue(),'0.25');
      await page.keyboard.press('Escape'); assert.equal(await overlay.count(),0);
      await tool('MFG').click(); assert.equal(await kerf.inputValue(),'0.25');

      if(name==='S'){
        await tool('S').click();await edge(2);await edge(6);
        await undo().click(); // A normal in-progress S group with only its first assignment.
        await history.getByRole('button',{name:'Panel Manager, opens Panel Manager panel',exact:true}).click();
        await edit('#pm-panel-thickness-panel-1','5');
        await edit('#pm-panel-thickness-panel-1','6'); await undo().click();
        const acceptedContours=await contours();
        await action('Apply').click();
        assert.match(await page.locator('.notice:not(.inline-notice)').innerText(),/one S-A edge and one S-B edge/);
        assert.equal(await contours(),acceptedContours);
        assert.equal(await action('Apply').isEnabled(),true,'thickness remains pending');
        assert.equal(await redo().isEnabled(),true,'failed generation preserves the accepted thickness edit on Redo');
        await redo().click();
        console.log('PASS incomplete second S connection: rejected PM Apply preserves accepted contours, pending thickness and Redo');
      }
      console.log(`PASS ${name}: actual SVG import, PM thickness edit/Apply, assignment, property edits, Geometry Apply, Finish, global Undo/Redo, manufacturing settings/Apply`);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

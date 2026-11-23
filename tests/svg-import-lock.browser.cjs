// Production App and native Chromium modal/input behavior. Only File.text is delayed.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const url = process.env.WORKSPACE_BROWSER_URL || 'http://127.0.0.1:5173/';
const panels = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100"><rect width="100" height="80"/><rect x="130" width="100" height="80"/></svg>';
const retryFile = 'tests/fixtures/06_two_independent_panels.svg';
const svg = content => ({name:'same.svg',mimeType:'image/svg+xml',buffer:Buffer.from(content)});
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:1366,height:768}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const input = () => page.getByLabel('Import SVG into BOX / Construction',{exact:true});
  const nav = name => page.getByRole('navigation',{name:'Main workspaces'}).getByRole('button',{name,exact:true});
  const tool = name => page.getByLabel('Tool sidebar',{exact:true}).getByRole('button',{name,exact:true});
  const overlay = () => page.getByLabel('Active Tool overlay',{exact:true});
  const modal = () => page.getByRole('dialog',{name:'Importing SVG…',exact:true});
  const drawingSnapshot = () => page.locator('.drawing-reference-sketch > *').evaluateAll(es => es.map(e => e.outerHTML));
  const boxSnapshot = () => page.evaluate(() => ({
    svg:document.querySelector('.workspace:not(.drawing-workspace) svg')?.innerHTML,
    history:document.querySelector('.shared-history-region')?.innerHTML,
    selectedTool:document.querySelector('.tool-sidebar .active')?.textContent,
    kerf:document.querySelector('#manufacturing-kerf')?.value,
    undo:document.querySelector('[aria-label="Undo (Ctrl+Z)"]')?.disabled,
    redo:document.querySelector('[aria-label="Redo (Ctrl+Y)"]')?.disabled,
  }));
  const waitUnlocked = () => page.waitForFunction(() => !document.querySelector('dialog.svg-import-dialog').open && !document.querySelector('main').inert);
  async function delayRead() {
    await page.evaluate(() => {
      window.svgReadCount = 0;
      const original = File.prototype.text;
      File.prototype.text = function () {
        window.svgReadCount++;
        // Exercise the selecting event before React can render the overlay.
        window.modalAtReadStart = !!document.querySelector('dialog:modal');
        for (const element of document.querySelectorAll('nav button, .project-commands button, .history-commands button')) element.click();
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
        const file = this;
        return new Promise((resolve,reject) => {
          window.settleSvgRead = async error => error ? reject(new Error(error)) : resolve(await original.call(file));
        });
      };
      window.restoreSvgRead = () => { File.prototype.text = original; };
    });
  }
  async function settle(error) {
    await page.evaluate(async error => { await window.settleSvgRead(error); window.restoreSvgRead(); },error);
    await waitUnlocked();
  }
  async function pointClick(x,y) {
    const client = await page.locator('svg.drawing-svg').evaluate((element,p) => {
      const q = new DOMPoint(p.x,p.y).matrixTransform(element.getScreenCTM()); return {x:q.x,y:q.y};
    },{x,y});
    await page.mouse.click(client.x,client.y);
  }
  try {
    await page.goto(url); await nav('2D Drawing').click();
    await page.getByRole('button',{name:'New Sketch',exact:true}).click();
    for (const y of [-70,40]) {
      await page.getByLabel('Drawing tools',{exact:true}).getByRole('button',{name:'Line',exact:true}).click();
      await pointClick(-120,y); await pointClick(-20,y);
    }
    assert.equal(await page.locator('[data-sketch-line-id]').count(),2);
    await page.getByRole('button',{name:'Finish Sketch',exact:true}).click();
    const drawing = await drawingSnapshot();
    assert.equal(drawing.length,2);
    await nav('Box / Construction').click();
    await input().setInputFiles(svg(panels));
    await page.getByRole('dialog',{name:'Panel Manager',exact:true}).getByRole('button',{name:'OK',exact:true}).click();
    await overlay().getByRole('button',{name:'Accept default thickness',exact:true}).click();
    await overlay().getByRole('button',{name:'Apply',exact:true}).click();
    await overlay().getByRole('button',{name:'OK',exact:true}).click();
    await tool('TB').click();
    await tool('MFG').click();
    await page.locator('#manufacturing-kerf').fill('0.25'); await page.locator('#manufacturing-kerf').press('Tab');
    await page.locator('#manufacturing-kerf').fill('0.35'); await page.locator('#manufacturing-kerf').press('Tab');
    await page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true}).click();
    // Opening the modal must not commit an underlying onBlur numeric draft.
    await page.locator('#manufacturing-kerf').fill('0.77');
    const box = await boxSnapshot();
    const targets = [];
    for (const locator of [nav('2D Drawing'),page.getByRole('button',{name:'Clear',exact:true}),
      page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true}),page.getByRole('button',{name:'Redo (Ctrl+Y)',exact:true}),
      page.getByRole('button',{name:'Panel Manager, opens Panel Manager panel',exact:true}),
      tool('TB'),tool('W'),tool('S'),page.locator('#manufacturing-kerf'),input().locator('..')]) {
      const bounds = await locator.boundingBox(); if(bounds) targets.push({x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2});
    }
    await delayRead(); await input().setInputFiles(retryFile); await modal().waitFor();
    assert.equal(await page.evaluate(() => window.modalAtReadStart),false,'same-event guard precedes modal commit');
    assert.equal(await input().inputValue(),'','captured native file selection reset immediately');
    assert.equal(await page.locator('main').evaluate(e => e.inert),true);
    assert.equal(await page.locator('dialog.svg-import-dialog').evaluate(e => e.matches(':modal')),true);
    assert.equal(await modal().getAttribute('aria-modal'),'true');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('dialog.svg-import-dialog')),true);
    let fileChoosers = 0; page.on('filechooser',()=>fileChoosers++);
    for(const point of targets) await page.mouse.click(point.x,point.y);
    for(const key of ['Tab','Shift+Tab','Escape','Enter','Space','Control+z','Control+y','Control+Shift+z','Meta+z','Delete','Backspace']) await page.keyboard.press(key);
    await page.evaluate(() => {
      for(const element of document.querySelectorAll('main button,main input,main select')) { element.focus(); element.click(); }
      const drawing = document.querySelector('svg.drawing-svg');
      for(const type of ['pointerdown','pointermove','pointerup','mousedown','mousemove','mouseup','click','dblclick'])
        drawing.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:350,clientY:350}));
      window.dispatchEvent(new CustomEvent('drawing:activate-dimension'));
    });
    assert.equal(await modal().isVisible(),true);
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('dialog.svg-import-dialog')),true);
    assert.equal(await page.evaluate(() => window.svgReadCount),1);assert.equal(fileChoosers,0);
    assert.equal(await page.locator('nav button[aria-pressed="true"]').textContent(),'Box / Construction');
    assert.equal(await page.locator('#clear-dialog-title').count(),0);
    assert.deepEqual(await boxSnapshot(),box);assert.deepEqual(await drawingSnapshot(),drawing);
    if(process.env.IMPORT_LOCK_SCREENSHOT) await page.screenshot({path:process.env.IMPORT_LOCK_SCREENSHOT});
    await settle('Simulated file read failure');
    assert.match(await page.locator('.notice:not(.inline-notice)').innerText(),/Simulated file read failure/);
    assert.deepEqual(await boxSnapshot(),box);assert.deepEqual(await drawingSnapshot(),drawing);
    assert.equal(await input().inputValue(),'');
    assert.equal(await page.evaluate(() => document.querySelector('main').contains(document.activeElement)),true,'native modal restores focus');
    console.log('PASS pending import: native modal, whole-app inert, same-event guard, pointer/navigation/Clear/PM/TB/W/S/MFG/history/shortcuts/focus/repeat-import block; read failure preserves project/history and unlocks');

    // The exact same file name/content can be chosen immediately after rejection.
    await input().setInputFiles(retryFile);
    await page.getByRole('dialog',{name:'Panel Manager',exact:true}).waitFor();await waitUnlocked();
    assert.equal(await input().inputValue(),'');assert.deepEqual(await drawingSnapshot(),drawing);
    assert.match(await page.getByRole('dialog',{name:'Panel Manager',exact:true}).innerText(),/Panel count: 2/);
    assert.equal(await page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true}).isEnabled(),true);
    await page.getByRole('dialog',{name:'Panel Manager',exact:true}).getByRole('button',{name:'OK',exact:true}).click();
    await nav('2D Drawing').click();
    await page.keyboard.press('Control+z');assert.deepEqual(await drawingSnapshot(),drawing);
    assert.equal(await page.locator('nav button[aria-pressed="true"]').textContent(),'Box / Construction');
    await page.keyboard.press('Control+z'); // Undo import after reversing navigation.
    assert.ok(await tool('TB').isEnabled());
    await page.keyboard.press('Control+y');assert.deepEqual(await drawingSnapshot(),drawing);
    await page.keyboard.press('Control+y');
    assert.equal(await nav('2D Drawing').getAttribute('aria-pressed'),'true');
    await nav('Box / Construction').click();
    console.log('PASS exact same SVG retry: successful import resets input and supplies one BOX transition, initializes Panel Manager with both panels and releases lock; global Undo/Redo resumes');

    const beforeInvalid = await boxSnapshot();
    for(const text of ['<svg><broken>','<html>not SVG</html>']) {
      await delayRead();await input().setInputFiles(svg(text));await modal().waitFor();await settle();
      assert.match(await page.locator('.notice:not(.inline-notice)').innerText(),/not a valid SVG/);
      assert.deepEqual(await boxSnapshot(),beforeInvalid);assert.equal(await input().inputValue(),'');
    }
    await input().setInputFiles(svg(panels));await page.getByRole('dialog',{name:'Panel Manager',exact:true}).waitFor();await waitUnlocked();
    console.log('PASS malformed and non-SVG inputs: real parser errors preserve prior project, unlock and allow retry');

    // Mount/unmount a real App, without test-only product hooks or project injection.
    await page.goto(url);await input().waitFor({state:'attached'});
    await page.evaluate(async () => {
      const [{default:React},{default:ReactDOM},{default:App}] = await Promise.all([
        import('/node_modules/.vite/deps/react.js'),import('/node_modules/.vite/deps/react-dom_client.js'),import('/src/App.tsx')]);
      const host = document.createElement('div');host.id='lifecycle-app';document.body.append(host);
      const root = ReactDOM.createRoot(host);root.render(React.createElement(React.StrictMode,null,React.createElement(App)));
      window.unmountImportApp = () => { root.unmount();host.remove(); };
    });
    const lifecycleInput = page.locator('#lifecycle-app input[type="file"]');await lifecycleInput.waitFor({state:'attached'});
    await delayRead();await lifecycleInput.setInputFiles(svg(panels));await page.locator('#lifecycle-app dialog:modal').waitFor();
    await page.evaluate(() => window.unmountImportApp());
    await page.evaluate(async () => { await window.settleSvgRead();window.restoreSvgRead(); });
    await nav('2D Drawing').click();assert.equal(await page.locator('dialog:modal').count(),0);
    assert.equal(await page.locator('#panel-manager-title').count(),0);
    console.log('PASS real App unmount during pending read: late success produces no modal/publication/error and global interaction listeners are removed');
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});

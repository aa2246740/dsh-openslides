import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {launchPinnedChromium} from '../../../scripts/lib/pinned-playwright.mjs';
import {marquee} from '../../../scripts/qa/gestures.mjs';

const ROOT=path.resolve(fileURLToPath(new URL('.',import.meta.url)),'../../..');

test('annotation context supports click/drag, inline edits, remove/undo, refresh and clean editing selection',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'openslides-comment-selection-'));
  const project=path.join(scratch,'project');
  fs.mkdirSync(path.join(project,'pages'),{recursive:true});
  fs.writeFileSync(path.join(project,'deck.pptd'),JSON.stringify({version:'v2',title:'Comment selection',size:[960,540],theme:{},pages:['pages/01.page']}));
  const pageFile=path.join(project,'pages/01.page');
  const original=JSON.stringify({pageType:'content',background:{type:'solid',color:'#FFFFFF'},elements:[
    {elementId:'title',elementType:'text',bounds:[80,80,800,60],content:{text:'Original title',fontSize:32}},
    {elementId:'body',elementType:'text',bounds:[80,240,600,40],content:{text:'Comment target',fontSize:24}},
  ]});
  fs.writeFileSync(pageFile,original);
  const port=await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const port=probe.address().port;probe.close(()=>resolve(port));});});
  const base=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),OPEN_SLIDESTUDIO_PROJECT:project,SLIDESTUDIO_RETENTION_DAYS:'0'},stdio:'ignore'});
  let browser;
  try {
    for(let i=0;i<80;i++) {
      try {if((await fetch(`${base}/api/health`)).ok) break;} catch {if(i===79) throw new Error('Test editor failed to start');}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    browser=await launchPinnedChromium({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=0`,{waitUntil:'domcontentloaded'});
    const title=page.locator('#slide .el[data-id="title"]');
    const body=page.locator('#slide .el[data-id="body"]');
    const selected=page.locator('#slide .el.selected');
    const handles=page.locator('#slide .handle, #slide .handle-rot-stem, #slide .sel-box');
    const targets=()=>page.locator('#comment-panel').evaluate(node=>JSON.parse(node.dataset.targetIds).sort());
    const noSelection=async()=>{
      await page.waitForFunction(()=>!document.querySelector('#slide .el.selected, #slide .handle, #slide .handle-rot-stem, #slide .sel-box'));
      const response=await fetch(`${base}/api/model?project=${encodeURIComponent(project)}`);
      const {model}=await response.json();
      assert.equal(model.selection.kind,'none');
      assert.equal(await selected.count(),0);assert.equal(await handles.count(),0);
    };
    await title.click();await page.waitForFunction(()=>!!document.querySelector('#slide .el.selected .handle'));
    await page.locator('#btn-comments').click();
    await noSelection();assert.deepEqual(await targets(),['title']);
    await body.click();assert.deepEqual(await targets(),['body']);await noSelection();
    assert.equal(await page.locator('#comment-panel').evaluate(el=>getComputedStyle(el).position),'fixed');
    assert.equal(await page.locator('#comment-list-wrap').isVisible(),false,'Draft only shows the current annotation task');
    const viewportWithPopup=await page.locator('#viewport').boundingBox();
    await page.locator('#comment-draft').fill('Draft survives dismissal');
    await page.mouse.click(430,120);
    await page.locator('#comment-panel').waitFor({state:'hidden'});
    assert.deepEqual(await page.locator('#viewport').boundingBox(),viewportWithPopup,'Floating card reserves no layout space');
    await body.click();
    assert.equal(await page.locator('#comment-draft').inputValue(),'Draft survives dismissal');

    await title.click({modifiers:['Shift']});assert.deepEqual(await targets(),['body','title']);await noSelection();
    await body.click();assert.deepEqual(await targets(),['body']);
    // Tab belongs to the annotation panel and cannot re-select a canvas object.
    await page.locator('#comment-draft').focus();await page.keyboard.press('Tab');await noSelection();
    // A drag chooses the region directly, without choosing a separate scope tool.
    await page.mouse.click(430,120);
    await marquee(page,72,72,240,288); // Cross both left edges; neither centre is in the box.
    assert.deepEqual(await targets(),['body','title']);await noSelection();
    assert.match(await page.locator('#comment-target').innerText(),/已选 2 个对象/);
    assert.equal(await page.locator('.comment-draft-region').count(),0,'Release shows actual targets instead of a misleading region');
    assert.equal(await page.locator('.comment-draft-target[data-ordinal]').count(),2);
    assert.equal(await page.locator('#comment-targets li').count(),2);
    await page.getByRole('button',{name:'取消选择文字“Original title”',exact:true}).click();
    assert.deepEqual(await targets(),['body']);
    assert.equal(await page.locator('[data-comment-draft-target="title"]').count(),0);
    assert.equal(await page.locator('#comment-draft').inputValue(),'Draft survives dismissal');
    await page.getByRole('button',{name:'取消选择文字“Comment target”',exact:true}).press('Enter');
    assert.deepEqual(await targets(),[]);
    assert.equal(await page.locator('#comment-add').isEnabled(),false,'Removing the last object never becomes whole-page authority');
    assert.match(await page.locator('#comment-target').innerText(),/未选择对象/);
    assert.equal(await page.locator('#comment-draft').evaluate(node=>node===document.activeElement),true);
    // Re-add through canvas, remove with Shift, then retain only body before save.
    await title.click({modifiers:['Shift']});
    await title.click({modifiers:['Shift']});assert.deepEqual(await targets(),[]);
    await body.click({modifiers:['Shift']});assert.deepEqual(await targets(),['body']);
    assert.match(await page.locator('#comment-mode-hint').innerText(),/拖动框选/);
    await page.mouse.click(430,120);await body.click();
    await page.locator('#comment-draft').fill('Review this object');
    await page.keyboard.press('Control+Enter');
    const pin=page.locator('#comment-layer .pin');
    await page.locator('#comment-panel').waitFor({state:'hidden'});
    // Adding finishes the annotation: the mode exits and no outline lingers.
    await page.waitForFunction(()=>!document.querySelector('.app').classList.contains('is-comment'));
    assert.equal(await page.locator('.comment-hover-target, .comment-draft-target, #comment-mode-hint:not([hidden])').count(),0);
    assert.equal(await page.locator('#work-chat').isVisible(),true);
    assert.match(await page.locator('#work-comment-batch-label').innerText(),/1 条批注/);
    const attachment=page.locator('#work-comment-items .comment-attachment');
    await attachment.waitFor();
    assert.match(await attachment.innerText(),/Review this object/);
    assert.equal(await page.locator('#comment-panel input[type=checkbox], #comment-inbox-toggle, [data-comment-scope], #comment-panel [data-act="resolve"]').count(),0);
    const readComment=async()=> (await (await fetch(`${base}/api/reviews?project=${encodeURIComponent(project)}&pagePath=pages%2F01.page`)).json()).comments[0];
    const originalComment=await readComment();
    assert.equal(originalComment.scope.kind,"elements");
    assert.deepEqual(originalComment.scope.elementIds,["body"],"Only confirmed targets reach durable review storage");
    await attachment.locator('.comment-attachment-open').click();
    const note=page.locator('#comment-list textarea');
    await note.fill('Updated comment context');
    assert.match(await attachment.innerText(),/Updated comment context/);
    await page.keyboard.press('Control+Enter');
    await page.locator('#comment-panel').waitFor({state:'hidden'});
    const updatedComment=await readComment();
    assert.equal(updatedComment.text,'Updated comment context');
    for(const key of ['x','y','ox','oy','createdAt','scope']) assert.deepEqual(updatedComment[key],originalComment[key],`Updating preserves ${key}`);
    await attachment.locator('.comment-attachment-remove').click();
    await attachment.waitFor({state:'detached'});
    const removed=await readComment();assert.equal(removed.resolved,true);assert.equal(removed.text,updatedComment.text);
    await page.locator('#app-toast .comment-undo').click();
    await attachment.waitFor();assert.equal((await readComment()).resolved,false);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#btn-sparkles').click();
    await attachment.waitFor();assert.match(await attachment.innerText(),/Updated comment context/);
    await attachment.locator('.comment-attachment-open').click();
    await pin.waitFor();assert.equal(await pin.innerText(),'1');
    await noSelection();assert.deepEqual(await targets(),['body']);
    assert.equal(await page.locator('.comment-compose').isVisible(),false,'A saved annotation opens only its editing card');
    await page.locator('#comment-panel-close').click();
    assert.equal(await page.locator('.app').evaluate(el=>el.classList.contains('is-comment')),true,'Closing a card keeps continuous annotation available');
    assert.equal(await page.locator('#btn-comments').getAttribute('aria-label'),'退出批注');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#comment-mode-hint').isVisible(),false,'Leaving annotation hides its gesture hint');
    await title.click();await page.waitForFunction(()=>!!document.querySelector('#slide .el.selected .handle'));
    assert.equal(await selected.getAttribute('data-id'),'title');
    assert.equal(fs.readFileSync(pageFile,'utf8'),original,'Annotation changes must not change slide content');
    await page.locator('#chat-close').click();
    const shots=process.env.SLIDESTUDIO_QA_OUTPUT_DIR || path.join(ROOT,'output/qa-comment-context');fs.mkdirSync(shots,{recursive:true});
    for(const width of [1440,877,375]) {
      await page.setViewportSize({width,height:900});
      await page.locator('#btn-comments').click();
      await page.mouse.click(10,150); // dismiss the card without leaving annotation mode
      const point=await page.locator('#slide').evaluate(el=>{
        const r=el.getBoundingClientRect(),v=document.getElementById('viewport').getBoundingClientRect();
        return {x:Math.min(r.right,v.right,innerWidth)-8,y:Math.min(r.bottom,v.bottom,innerHeight)-8};
      });
      await page.mouse.click(point.x,point.y);
      await page.locator('#comment-panel').waitFor({state:'visible'});
      await page.locator('#comment-draft').fill('边缘浮卡草稿，不提交');
      const bounds=await page.locator('#comment-panel').boundingBox();
      assert.ok(bounds.x>=11&&bounds.y>=11&&bounds.x+bounds.width<=width-11&&bounds.y+bounds.height<=889,`Popover stays in ${width}px viewport: ${JSON.stringify(bounds)}`);
      assert.ok(!(point.x>bounds.x&&point.x<bounds.x+bounds.width&&point.y>bounds.y&&point.y<bounds.y+bounds.height),'Popover does not cover the clicked point');
      await page.screenshot({path:path.join(shots,`draft-${width}.png`)});
      await page.keyboard.press('Escape');
      await page.locator('#comment-panel').waitFor({state:'hidden'});
      assert.equal(await page.locator('#btn-comments').evaluate(el=>el===document.activeElement),true);
    }
    assert.equal(fs.readFileSync(pageFile,'utf8'),original,'Popover interactions must not change the document');

  } finally {
    await browser?.close();
    if(server.exitCode===null) {const exited=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await exited;}
    fs.rmSync(scratch,{recursive:true,force:true});
  }
});

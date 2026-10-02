import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {launchPinnedChromium} from '../../../scripts/lib/pinned-playwright.mjs';

const ROOT=path.resolve(fileURLToPath(new URL('.',import.meta.url)),'../../..');

// Oracle row chrome.comments.retry: when the project review read fails and only
// a local cache remains, the panel shows 重试; clicking it re-reads the project
// and replaces the cached state. Fault is injected once at GET /api/reviews.
test('comment panel recovers from a failed review read via the retry control',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'openslides-comment-retry-'));
  const project=path.join(scratch,'project');
  fs.mkdirSync(path.join(project,'pages'),{recursive:true});
  fs.writeFileSync(path.join(project,'deck.pptd'),JSON.stringify({version:'v2',title:'Comment retry',size:[960,540],theme:{},pages:['pages/01.page']}));
  fs.writeFileSync(path.join(project,'pages/01.page'),JSON.stringify({pageType:'content',background:{type:'solid',color:'#FFFFFF'},elements:[
    {elementId:'title',elementType:'text',bounds:[80,80,800,60],content:{text:'Title',fontSize:32}},
    {elementId:'body',elementType:'text',bounds:[80,240,600,40],content:{text:'Body',fontSize:24}},
  ]}));
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
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let failArmed=false;
    await page.route('**/api/reviews?**',route=>{
      const req=route.request();
      const url=new URL(req.url());
      if(req.method()==='GET'&&url.searchParams.has('pagePath')&&!url.searchParams.has('all')&&failArmed){
        failArmed=false;
        return route.fulfill({status:500,json:{error:'injected outage'}});
      }
      return route.fallback();
    });
    await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=0`,{waitUntil:'domcontentloaded'});
    // Phase 1: one successful read so the app writes its real cache key; seed a
    // cached comment under it, then reload so the next open re-reads the project.
    await page.waitForSelector('#slide .el',{timeout:15000});
    await page.locator('#btn-comments').click();
    const cacheKey=await page.waitForFunction(()=>Object.keys(localStorage).find(k=>k.startsWith('oss.comments:')),null,{timeout:10000}).then(h=>h.jsonValue());
    await page.evaluate(key=>localStorage.setItem(key,JSON.stringify([{id:'c1',text:'cached note',x:0.5,y:0.5,revision:0}])),cacheKey);
    failArmed=true;
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#btn-comments').click();
    await page.waitForSelector('#comment-layer .pin',{timeout:10000});
    await page.locator('#comment-layer .pin').click();
    const retry=page.locator('.comment-retry[data-control="chrome.comments.retry"]');
    await retry.waitFor({state:'visible',timeout:10000});
    assert.equal(await page.locator('.comment-list-status.is-cached').count(),1,'cached status must be shown before retry');
    await retry.click();
    await page.waitForFunction(()=>!document.querySelector('.comment-list-status.is-cached')&&!document.querySelector('.comment-list-status.is-error'),{timeout:10000});
    assert.equal(await page.locator('.comment-retry').count(),0,'retry button must disappear once the project read succeeds');
    assert.deepEqual(errors.filter(e=>!/favicon/i.test(e)),[],'page errors: '+JSON.stringify(errors));
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
    fs.rmSync(scratch,{recursive:true,force:true});
  }
});

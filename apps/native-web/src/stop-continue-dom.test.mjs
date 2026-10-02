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

test('a running generation stops at once and continues with a new instruction',async()=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-stop-'));
 const project=path.join(scratch,'project');fs.cpSync(path.join(ROOT,'fixtures/okp-yu7-ppt'),project,{recursive:true});
 const port=await new Promise(resolve=>{const p=net.createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n));});});
 const base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),OPEN_SLIDESTUDIO_PROJECT:project,SLIDESTUDIO_RETENTION_DAYS:'0'},stdio:'ignore'});
 let browser;
 try{
  for(let i=0;i<80;i++){try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await launchPinnedChromium({headless:true});
  const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let busy=true;const stops=[];const turns=[];
  const now=Date.now();const at=n=>new Date(now+n*1000).toISOString();
  const activity={ok:true,sessionId:'stop-test',brief:'做一份月度运营报告',phase:'generating',agentStatus:'busy',provider:{providerId:'test',modelId:'cheap'},
   project:{path:project,title:'Stop test',pageCount:0,pagePaths:[]},stages:[],inspection:{pages:[]},
   events:[{id:'r1',turn:1,at:at(1),kind:'reasoning',detail:'先读取参考资料。',status:'complete'},{id:'t1',turn:1,at:at(2),kind:'tool',callId:'t1',name:'read_reference',detail:'{"sourceId":"x"}',status:'running'}],
   conversation:{version:1,mode:'generate',messages:[]}};
  await page.route('**/api/generation-activity**',r=>r.fulfill({json:activity}));
  await page.route('**/slides/state/stop-test',r=>r.fulfill({json:{agentStatus:busy?'busy':'idle',binding:{dshSessionId:'stop-test'},phase:{kind:busy?'generating':'paused'},questions:[]}}));
  await page.route('**/slides/sessions/stop-test/events',r=>r.abort());
  await page.route('**/slides/providers',r=>r.fulfill({json:{providers:[{id:'test',ready:true,name:'Test',models:['cheap']}]}}));
  await page.route('**/slides/sessions/stop-test/stop',r=>{
   stops.push(r.request().headers()['content-type']||'');
   busy=false;activity.phase='paused';activity.agentStatus='idle';
   activity.events.push({id:'end1',turn:1,at:at(3),kind:'turn',name:'turn',status:'cancelled'});
   return r.fulfill({json:{ok:true,stopped:true}});
  });
  await page.route('**/slides/assistant-intent',r=>r.fulfill({json:{ok:true,intent:'generate',scope:'deck',pages:[]}}));
  await page.route('**/slides/sessions/stop-test/turn',r=>{turns.push(r.request().postDataJSON());busy=true;return r.fulfill({json:{ok:true}});});

  await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=1&live=1&session=stop-test`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#workspace-cover',{state:'hidden'});
  const send=page.locator('#work-form .composer-send');
  await page.waitForFunction(()=>document.querySelector('#work-form .composer-send')?.classList.contains('is-stopping'));

  const clicked=Date.now();
  await send.click();
  // Settled = the stop is confirmed (button enabled again) and ■ is gone.
  await page.waitForFunction(()=>{const b=document.querySelector('#work-form .composer-send');return !b.classList.contains('is-stopping')&&!b.disabled;},null,{timeout:3000});
  const settledMs=Date.now()-clicked;
  assert.equal(stops.length,1,'one stop request');
  assert.match(stops[0],/application\/json/,'the stop request is typed JSON so the kernel guard accepts it');
  assert.equal(await page.locator('#generation-think-status').isVisible(),false,'no lingering 正在思考 after a confirmed stop');
  assert.ok(settledMs<3000,`control returned after ${settledMs}ms`);

  // Continue in a new direction from the same conversation.
  const input=page.getByLabel('与 AI 协作',{exact:true});
  await input.fill('方向不对，改成电商零售的月报');await input.press('Enter');
  for(let i=0;i<60&&!turns.length;i++)await new Promise(r=>setTimeout(r,100));
  assert.equal(turns.length,1,'the new instruction reaches the same session');
  assert.match(JSON.stringify(turns[0]),/电商零售/);
  assert.deepEqual(errors,[]);
 }finally{
  await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await done;}
  fs.rmSync(scratch,{recursive:true,force:true});
 }
});

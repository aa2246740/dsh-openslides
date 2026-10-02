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
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('chat remains readable and editable through inference, acceptance, streaming, failure and reload',async()=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-composer-'));
 const project=path.join(scratch,'project');fs.cpSync(path.join(ROOT,'fixtures/okp-yu7-ppt'),project,{recursive:true});
 const port=await new Promise(resolve=>{const p=net.createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n));});});
 const base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),OPEN_SLIDESTUDIO_PROJECT:project,SLIDESTUDIO_RETENTION_DAYS:'0'},stdio:'ignore'});
 let browser;
 const out=process.env.SLIDESTUDIO_QA_OUTPUT_DIR || path.join(ROOT,'output/assistant-chat-acceptance-2026-09-20');fs.mkdirSync(out,{recursive:true});
 const evidence=[];
 try {
  for(let i=0;i<80;i++){try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await launchPinnedChromium({headless:true});
  const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const reply='可以换成**科幻风**，我会保留标题和正文。\n\n- **背景**：近黑的深空蓝 #0A1020\n- **主色**：青蓝荧光 #35E0FF\n\n1. 保留原有内容\n2. 调整配色和细线\n\n| 位置 | 配色 |\n|---|---|\n| 标题 | **青蓝色** |\n| 正文 | 冷白色 |\n\n'+('这是需要自然换行的说明，不能遮住输入框。'.repeat(20));
  let current={ok:true,sessionId:'chat-test',brief:'测试对话',phase:'complete',agentStatus:'idle',provider:{providerId:'test',modelId:'cheap'},project:{path:project,title:'Chat acceptance',pageCount:2,pagePaths:['pages/01_cover.page','pages/02_overview.page']},stages:[],inspection:{pages:[]},events:[{id:'a0',kind:'message',at:'2026-09-20T01:00:00Z',detail:reply,status:'complete'}],conversation:{version:1,mode:'generate',messages:[]}};
  let busy=false,planGate=null,turnGate=null,planFail=false;const plans=[],turns=[],toasts=[];
  await page.route('**/api/generation-activity**',route=>route.fulfill({json:current}));
  await page.route('**/slides/providers',route=>route.fulfill({json:{providers:[{id:'test',name:'Local',ready:true,models:['cheap']}]}}));
  await page.route('**/slides/state/chat-test',route=>route.fulfill({json:{agentStatus:busy?'busy':'idle',binding:{dshSessionId:'chat-test'},phase:{kind:'complete'}}}));
  await page.route('**/slides/sessions/chat-test/events',route=>route.abort());
  await page.route('**/slides/assistant-intent',async route=>{
   plans.push(route.request().postDataJSON());if(planGate)await planGate.promise;
   await route.fulfill(planFail?{status:503,json:{error:'模型暂时不可用，输入内容已保留。'}}:{json:{ok:true,intent:'discuss',scope:'current',pages:[]}});
  });
  await page.route('**/slides/sessions/chat-test/turn',async route=>{
   const body=route.request().postDataJSON();turns.push(body);if(turnGate)await turnGate.promise;
   const i=turns.length;busy=true;current.phase='complete';current.conversation.mode='discuss';
   current.conversation.messages.push({id:`u${i}`,at:`2026-09-20T01:00:${String(i*2).padStart(2,'0')}Z`,text:body.text,mode:'discuss'});
   current.events.push({id:`a${i}`,kind:'message',at:`2026-09-20T01:00:${String(i*2+1).padStart(2,'0')}Z`,detail:`**回复 ${i}**：上下文已收到。`,status:'complete'});
   await route.fulfill({json:{ok:true,userMessage:current.conversation.messages.at(-1)}});
  });
  await page.exposeFunction('recordToast',t=>toasts.push(t));
  await page.addInitScript(()=>{new MutationObserver(()=>{const t=document.querySelector('#app-toast')?.textContent;if(t)window.recordToast(t);}).observe(document,{childList:true,subtree:true,characterData:true});});
  if(process.env.QA_BASELINE_STYLES) await page.route('**/styles.css*',route=>route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(out,'before/apps/native-web/public/styles.css'),'utf8')}));
  await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=1`,{waitUntil:'domcontentloaded'});
  // The workspace cover holds input until the editor layout is stable.
  await page.waitForSelector('#workspace-cover',{state:'hidden'});
  const input=page.getByLabel('与 AI 协作',{exact:true});
  await page.locator('.generation-message-card .md-body strong').first().waitFor({state:'attached'});
  assert.equal(await page.locator('#assistant-mode').count(),0);
  for(const width of [1440,877,390]){
   await page.setViewportSize({width,height:900});
   const metrics=await page.evaluate(()=>{
    const list=document.getElementById('editor-generation-event-list'),input=document.getElementById('work-brief');
    const body=document.querySelector('.generation-message-card .md-body');
    const rect=input.getBoundingClientRect();
    return {width:innerWidth,docWidth:document.documentElement.scrollWidth,listWidth:list.clientWidth,listScrollWidth:list.scrollWidth,
      bold:[...body.querySelectorAll('strong')].map(x=>({text:x.textContent,display:getComputedStyle(x).display})),
      ul:getComputedStyle(body.querySelector('ul')).listStyleType,ol:getComputedStyle(body.querySelector('ol')).listStyleType,
      olOverflow:getComputedStyle(body.querySelector('ol')).overflowY,
      marker:!!document.querySelector('.generation-message-card .generation-process-head')&&getComputedStyle(document.querySelector('.generation-message-card .generation-process-head')).display,
      inputBottom:rect.bottom,hit:document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.id};
   });
   assert.ok(metrics.docWidth<=width+1,JSON.stringify(metrics));assert.ok(metrics.listScrollWidth<=metrics.listWidth+1,JSON.stringify(metrics));
   assert.ok(metrics.bold.every(x=>x.display!=='none'));assert.equal(metrics.marker,'none');
   assert.equal(await page.locator('.generation-message-card .md-body table').count(),1);
   assert.equal(metrics.ul,'disc');assert.equal(metrics.ol,'decimal');assert.equal(metrics.olOverflow,'visible');
   assert.equal(metrics.hit,'work-brief');assert.ok(metrics.inputBottom<900);
   await input.click();await page.keyboard.type('Can I type?');assert.equal(await input.inputValue(),'Can I type?');assert.equal(await page.locator('#kbd-help').isVisible(),false);
   await input.fill('');await page.screenshot({path:path.join(out,`readable-${width}.png`)});evidence.push(metrics);
  }
  await page.setViewportSize({width:1440,height:900});
  await input.fill('中文候选确认');
  await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:false,bubbles:true,cancelable:true});
  await input.dispatchEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});
  assert.equal(plans.length,0,'IME candidate confirmation is not a send');
  await input.press('Shift+Enter');await page.keyboard.type('second line');assert.match(await input.inputValue(),/\nsecond line/);
  planGate=deferred();await input.fill('第一条请求');await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#editor-generation-event-list').textContent.includes('第一条请求'));
  assert.equal(await input.inputValue(),'','send clears before intent and Host acknowledgement');
  assert.equal(await page.locator('#assistant-feedback').isVisible(),false);
  assert.equal(await input.evaluate(x=>x===document.activeElement),true,'send returns keyboard focus to composer');
  await input.fill('判断期间的新草稿');turnGate=deferred();planGate.resolve();planGate=null;
  await page.waitForFunction(()=>document.querySelector('#work-chat').classList.contains('is-live-generation'));
  await input.fill('等待接收期间的新草稿');turnGate.resolve();turnGate=null;
  await page.waitForFunction(()=>document.querySelector('#editor-generation-event-list').textContent.includes('回复 1'));
  assert.equal(await input.inputValue(),'等待接收期间的新草稿');assert.equal(await input.isEditable(),true);
  await input.press('End');await page.keyboard.type('?');assert.match(await input.inputValue(),/\?$/);
  busy=false;
  await page.waitForFunction(()=>document.querySelector('#editor-generation-status').textContent==='继续聊聊');
  assert.equal(await input.inputValue(),'等待接收期间的新草稿?');
  await input.fill('第二条请求');await input.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#editor-generation-event-list').textContent.includes('回复 2'));
  assert.equal(await input.inputValue(),'','accepted unchanged draft clears immediately');
  await page.keyboard.type('正在回复时继续打字');busy=false;
  await page.waitForFunction(()=>document.querySelector('#editor-generation-status').textContent==='继续聊聊');
  assert.equal(await input.inputValue(),'正在回复时继续打字');
  planFail=true;await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#editor-generation-event-list').textContent.includes('模型暂时不可用'));
  assert.equal(await input.inputValue(),'');
  await input.fill('失败后继续写的新草稿');
  await page.locator('.assistant-reply-actions button').filter({hasText:'重试'}).click();
  assert.equal(await input.inputValue(),'失败后继续写的新草稿');assert.equal(turns.length,2);assert.equal(await input.isEditable(),true);
  assert.ok(toasts.every(t=>!/(生成完成|已生成|共 2 页)/.test(t)),JSON.stringify(toasts));
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#editor-generation-event-list').textContent.includes('回复 2'));
  assert.match(await page.locator('#editor-generation-event-list').innerText(),/第一条请求/);
  assert.equal(await page.locator('#assistant-model').inputValue(),'test/cheap');
  // Continuing from discussion uses workspace=1, without the initial live=1 route.
  busy=true;current.conversation.mode='generate';current.phase='generating';
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#work-chat').classList.contains('is-live-generation'));
  const beforeCount=await page.locator('#page-count').innerText();
  const response=await fetch(`${base}/api/command?project=${encodeURIComponent(project)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cmd:'addPage'})});
  const added=await response.json();assert.equal(response.ok,true,JSON.stringify(added));
  current.project.pageCount=added.model.pageCount;current.project.pagePaths=added.model.pagePaths;
  current.inspection.pages=added.model.pagePaths.map((p,i)=>({pageId:p.split('/').at(-1).replace(/\.page$/,''),revision:2,pageSha256:`new-${i}`}));
  await page.waitForFunction(count=>document.querySelector('#page-count').textContent.endsWith(` / ${count}`),added.model.pageCount);
  assert.notEqual(await page.locator('#page-count').innerText(),beforeCount,'the resumed conversation refreshes written pages without a reload');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'composer-dom-proof.json'),JSON.stringify({evidence,turns:turns.map(x=>({text:x.text,mode:x.conversationMode})),checks:['IME','keyboard','focus','no obsolete toast','no duplicate mode','new draft while routing','new draft while pending acknowledgement','new draft while streaming','failure retains draft','reload history'],errors},null,2));
 }finally{
  await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await done;}fs.rmSync(scratch,{recursive:true,force:true});
 }
});

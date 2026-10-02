import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {launchPinnedChromium} from '../../../scripts/lib/pinned-playwright.mjs';

const ROOT=path.resolve(fileURLToPath(new URL('.',import.meta.url)),'../../..');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const BRIEF='给新员工做一份 5 页的信息安全培训，语气轻松';

async function startServer(project,kernelPort){
  const port=await new Promise(resolve=>{const p=net.createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n));});});
  const base=`http://127.0.0.1:${port}`;
  const env={...process.env,PORT:String(port),OPEN_SLIDESTUDIO_PROJECT:project,SLIDESTUDIO_RETENTION_DAYS:'0'};
  if(kernelPort)env.SLIDES_DSH_PORT=String(kernelPort);
  const server=spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:ROOT,env,stdio:'ignore'});
  for(let i=0;i<80;i++){try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  return {base,server};
}

// A minimal in-process kernel that answers the launch page's boot probes with
// the real response shapes. Used to prove the live proxy path — no route
// mocks — reaches networkidle and enables Send.
async function startFakeKernel(){
  const catalog={version:1,hash:TEST_SHA,formats:[{kind:"Slides",layout:"16:9"},{kind:"Slides",layout:"4:3"}],styles:[]};
  const kernel=http.createServer((req,res)=>{
    const path=new URL(req.url,"http://x").pathname;
    const send=(obj)=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(obj));};
    if(path==="/slides/catalog")return send(catalog);
    if(path==="/slides/health")return send({ok:true,product:"DSH SlideStudio",generateReady:true,selection:{providerId:"test",model:"cheap",ready:true},connection:{ready:true},capability:null,catalog:{},providers:[]});
    if(path==="/slides/providers")return send({providers:[{id:"test",name:"Local",ready:true,models:["cheap"]}],connection:{ready:true}});
    if(path==="/slides/models")return send([{providerId:"test",providerName:"Local",ready:true,models:[{id:"cheap",name:"cheap",inputModalities:["text"]}],modelEfforts:{cheap:[]}}]);
    if(path.startsWith("/plugins/"))return send({ok:true,status:"signed-out",providers:[]});
    return send({ok:true});
  });
  const port=await new Promise(r=>{kernel.listen(0,"127.0.0.1",()=>r(kernel.address().port));});
  return {port,kernel};
}

async function mockProviders(page){
  await page.route('**/slides/providers',route=>route.fulfill({json:{providers:[{id:'test',name:'Local',ready:true,models:['cheap']}]}}));
  await page.route('**/slides/models',route=>route.fulfill({json:[{providerId:'test',providerName:'Local',ready:true,models:[{id:'cheap',name:'cheap',inputModalities:['text']}],modelEfforts:{cheap:[]}}]}));
}

// Catch-all for kernel routes the test does not care about. The launch page
// fires /slides/* and /plugins/* health probes on load; with no kernel running
// (these tests spawn only server.mjs) the proxy leaves the requests pending and
// `networkidle` never settles. Registered first so the specific routes below
// take precedence — Playwright tries the most recently added route first.
const TEST_SHA = "a".repeat(64);
const TEST_CATALOG = {
  version: 1,
  hash: TEST_SHA,
  formats: [
    { kind: "Slides", layout: "16:9" },
    { kind: "Slides", layout: "4:3" },
  ],
  styles: [
    {
      id: "work/plain",
      label: "Plain",
      category: "work",
      designSourceId: "ds-plain",
      designHash: TEST_SHA,
      previews: [
        {
          sourceId: "pv-plain",
          hash: TEST_SHA,
          order: 0,
          url: `/slides/catalog/previews/${encodeURIComponent("pv-plain")}`,
        },
      ],
    },
  ],
};
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
async function mockKernelCatchAll(page){
  await page.route('**/plugins/**',route=>route.fulfill({json:{ok:true,status:'signed-out',providers:[]}}));
  await page.route('**/slides/catalog/previews/**',route=>route.fulfill({contentType:'image/png',body:PIXEL_PNG}));
  await page.route('**/slides/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/slides/catalog')return route.fulfill({json:TEST_CATALOG});
    if(path==='/slides/health'){
      return route.fulfill({json:{ok:true,product:'DSH SlideStudio',generateReady:true,selection:{providerId:'test',model:'cheap',ready:true},connection:{ready:true},capability:null,catalog:{},providers:[]}});
    }
    if(path==='/slides/tool-settings')return route.fulfill({json:{ok:true,settings:{}}});
    return route.fulfill({json:{ok:true}});
  });
}

test('Hub groups prompt and recent work without a viewport-sized gap in either theme',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-hub-spacing-'));
  const project=path.join(scratch,'project');fs.cpSync(path.join(ROOT,'fixtures/okp-yu7-ppt'),project,{recursive:true});
  const {base,server}=await startServer(project);
  let browser;
  try{
    browser=await launchPinnedChromium({headless:true});
    const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1000}});
    await mockKernelCatchAll(page);
    await mockProviders(page);
    await page.route('**/api/projects',route=>route.fulfill({json:{projects:Array.from({length:6},(_,i)=>({
      id:`spacing-${i}`,group:'generated',path:project,title:`项目 ${i+1} · 中英混排 Office`,
      pageCount:5,updatedAt:Date.now()-i*60000,
    }))}}));
    await page.goto(`${base}/`,{waitUntil:'networkidle'});
    await page.waitForSelector('#project-list .proj-row');
    await page.evaluate(()=>document.fonts.ready);
    for(const theme of ['warm','ink']){
      await page.evaluate(async value=>(await import('./theme.js')).applyTheme(value),theme);
      for(const [width,height] of [[1920,1080],[1440,1000],[1024,768],[390,844],[320,640],[1440,420]]){
        await page.setViewportSize({width,height});
        const layout=await page.evaluate(()=>{
          const prompt=document.querySelector('.prompt-card').getBoundingClientRect();
          const projects=document.querySelector('.projects-panel').getBoundingClientRect();
          const row=document.querySelector('#project-list .proj-row').getBoundingClientRect();
          const wordmark=document.querySelector('.wordmark').getBoundingClientRect();
          return {gap:projects.top-prompt.bottom,top:wordmark.top,firstRowBottom:row.bottom,
            overflow:document.documentElement.scrollWidth-innerWidth};
        });
        assert.ok(layout.gap>=32&&layout.gap<=64,`${theme} ${width}×${height}: ${JSON.stringify(layout)}`);
        assert.ok(layout.top>=64&&layout.top<=128,`${theme} ${width}: bounded top whitespace`);
        assert.equal(layout.overflow,0,`${theme} ${width}: no sideways scroll`);
        if(height>=640)assert.ok(layout.firstRowBottom<=height,`${theme} ${width}: recent work is visible without scrolling`);
      }
    }
  }finally{
    await browser?.close();server.kill('SIGTERM');fs.rmSync(scratch,{recursive:true,force:true});
  }
});

test('Hub keeps an opened model panel, groups usable models and preserves exact selections',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-model-picker-'));
  const project=path.join(scratch,'project');fs.cpSync(path.join(ROOT,'fixtures/okp-yu7-ppt'),project,{recursive:true});
  const {base,server}=await startServer(project);
  let browser;
  const gate=deferred();
  try{
    browser=await launchPinnedChromium({headless:true});
    const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:900}});
    const reopen=async()=>{
      if(await page.locator('#pi-panel').isVisible())await page.click('#btn-model');
      await page.click('#btn-model');
      await page.waitForSelector('#pi-panel:not([hidden])');
    };
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await mockKernelCatchAll(page);
    let calls=0,status=200,refreshGate=null;
    const groups=[
      {providerId:'local',providerName:'本地模型',ready:true,models:[{id:'text',name:'文字模型'}],modelEfforts:{text:[]}},
      {providerId:'test',providerName:'Remote',ready:true,models:[{id:'vendor/vision',name:'Vision 中文'}],modelEfforts:{'vendor/vision':['low','high']}},
      {providerId:'broken',providerName:'Broken',ready:false,models:[{id:'hidden',name:'hidden'}]},
    ];
    let catalog=groups;
    await page.route('**/slides/models',async route=>{
      calls++;await gate.promise;await refreshGate?.promise;
      await route.fulfill({status,json:status===200?catalog:{error:'unavailable'}});
    });
    await page.route('**/slides/health**',route=>{
      const url=new URL(route.request().url());
      const providerId=url.searchParams.get('provider'),model=url.searchParams.get('model');
      return route.fulfill({json:{ok:true,product:'DSH SlideStudio',selection:{providerId,model,ready:true},
        capability:{research:{configured:false},imageSearch:{configured:false},imageGenerate:{configured:false},vision:{mode:model==='vendor/vision'?'main-model':'none'}}}});
    });
    await page.goto(`${base}/`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.getElementById('brief'));
    await page.click('#btn-model');
    gate.resolve();
    await page.waitForFunction(()=>document.querySelectorAll('#pi-model [role="group"]').length===2);
    assert.equal(await page.locator('#pi-panel').isVisible(),true,'initial requests cannot undo the user click');
    assert.equal(await page.locator('#btn-model').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#pi-effort-wrap').isHidden(),true);
    const cardHeight=await page.locator('.prompt-card').evaluate(el=>el.getBoundingClientRect().height);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.modelKey),'local/text');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.modelKey),'test/vendor/vision');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#pi-panel').isHidden(),true,'picking a model closes the popup');
    await page.click('#btn-model');
    await page.waitForFunction(()=>document.querySelector('#capability-row li')?.classList.contains('is-on'));
    assert.equal(await page.locator('#pi-effort-wrap').isVisible(),true);
    assert.equal(await page.locator('#pi-panel select, #pi-login-status, #pi-provider').count(),0);
    assert.equal(await page.locator('.prompt-card').evaluate(el=>el.getBoundingClientRect().height),cardHeight,'popup never expands the prompt card');
    await page.click('#pi-effort [data-effort="low"]');
    assert.equal(await page.locator('#pi-panel').isVisible(),true,'effort selection keeps the popup open');
    assert.equal(await page.locator('#pi-effort [data-effort="low"]').getAttribute('aria-checked'),'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#pi-effort [data-effort="high"]').getAttribute('aria-checked'),'true');
    assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('oss.pi.provider'),localStorage.getItem('oss.pi.model')]),['test','vendor/vision']);
    await page.locator('#capability-row li').first().focus();
    await page.waitForFunction(()=>document.querySelector('#capability-row li')?.getAttribute('data-tip'));
    assert.match(await page.locator('#capability-row li').first().getAttribute('aria-label'),/看图/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#pi-panel').isHidden(),true);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'btn-model');
    await page.reload({waitUntil:'networkidle'});
    await page.click('#btn-model');
    assert.equal(await page.locator('#pi-model [aria-selected="true"]').getAttribute('data-model-key'),'test/vendor/vision');
    await page.waitForFunction(()=>document.querySelectorAll('#capability-row li').length===4);
    refreshGate=deferred();
    await reopen();
    await page.locator('#capability-row li').first().focus();
    refreshGate.resolve();refreshGate=null;
    await page.waitForFunction(()=>document.activeElement.dataset.modelKey==='test/vendor/vision');
    assert.equal(await page.locator('#pi-panel').isVisible(),true,'catalog and capability refresh preserve keyboard focus inside the popup');
    await page.locator('#pi-model [aria-selected="true"]').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.modelKey),'test/vendor/vision');
    for(const [width,height] of [[1440,900],[390,900],[320,900],[1440,420],[320,420]]){
      await page.setViewportSize({width,height});
      await page.waitForFunction(()=>{
        const panel=document.getElementById('pi-panel').getBoundingClientRect();
        return document.documentElement.scrollWidth<=innerWidth&&panel.left>=0&&panel.right<=innerWidth&&panel.top>=0&&panel.bottom<=innerHeight;
      },null,{timeout:3000});
    }
    await page.setViewportSize({width:1440,height:900});
    await page.click('.wordmark');
    assert.equal(await page.locator('#pi-panel').isHidden(),true,'outside click closes');
    await page.click('#btn-model');
    await page.click('#btn-layout');
    assert.equal(await page.locator('#pi-panel').isHidden(),true,'other menu closes the model popup');
    const modelRefresh=page.waitForResponse(r=>r.url().includes('/slides/models'),{timeout:5000}).catch(()=>null);
    const healthRefresh=page.waitForResponse(r=>r.url().includes('/slides/health'),{timeout:5000}).catch(()=>null);
    await page.click('#btn-model');
    assert.equal(await page.locator('#layout-menu').isHidden(),true);
    // settle the open-time catalog + capability refresh before measuring Tab
    // behavior — the repaint legitimately restores focus to the selected option.
    await modelRefresh;
    await page.waitForFunction(()=>document.querySelectorAll('#pi-model [role="group"]').length===2);
    await healthRefresh;
    await page.locator('#capability-row li').last().focus();
    await page.keyboard.press('Tab');
    // focusout with relatedTarget=null closes the panel on the next frame —
    // wait for the actual hidden state, not a same-tick snapshot.
    await page.waitForFunction(()=>document.getElementById('pi-panel').hidden===true);
    assert.equal(await page.locator('#pi-panel').isHidden(),true,'Tab leaving closes');
    catalog=[];
    await reopen();
    await page.waitForFunction(()=>document.getElementById('pi-model').getAttribute('aria-disabled')==='true');
    await page.fill('#brief',BRIEF);
    assert.equal(await page.locator('#btn-send').isDisabled(),true);
    assert.match(await page.locator('#pi-provider-note').innerText(),/右上角/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('oss.pi.model')),'vendor/vision');
    status=503;
    await reopen();
    await page.waitForFunction(()=>document.getElementById('pi-provider-note').textContent.includes('无法加载'));
    status=200;catalog=groups;
    await reopen();
    await page.waitForFunction(()=>document.getElementById('pi-model').getAttribute('aria-disabled')==='false');
    assert.equal(await page.locator('#pi-model [aria-selected="true"]').getAttribute('data-model-key'),'test/vendor/vision');
    catalog=[...groups,{providerId:'many',providerName:'长列表',ready:true,models:Array.from({length:24},(_,i)=>({id:`model-${i}`,name:`Long model ${i} 中文名称`}))}];
    await reopen();
    await page.waitForFunction(()=>document.querySelectorAll('#pi-model [role="option"]').length===26);
    assert.equal(await page.locator('#pi-model').evaluate(el=>el.scrollHeight>el.clientHeight),true);
    await page.locator('#pi-model [aria-selected="true"]').focus();
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.modelKey),'many/model-23');
    await page.click('#pi-model [data-model-key="test/vendor/vision"]');
    await page.click('#btn-model');
    await page.click('#pi-effort [data-effort="low"]');
    await page.fill('#brief',BRIEF);
    await page.waitForFunction(()=>!document.getElementById('btn-send').disabled);
    await page.click('#btn-send');
    await page.waitForURL(/index\.html\?launch=/);
    const request=await page.evaluate(()=>{
      const id=new URL(location.href).searchParams.get('launch');
      return JSON.parse(sessionStorage.getItem(`oss:launch:${id}`)).request;
    });
    assert.deepEqual([request.provider,request.model,request.reasoningEffort],['test','vendor/vision','low']);
    assert.ok(calls>=5);
    assert.deepEqual(errors,[]);
  }finally{
    gate.resolve();await browser?.close();server.kill('SIGTERM');fs.rmSync(scratch,{recursive:true,force:true});
  }
});

test('Send opens the editor at once, shows the message, then binds the live session without a reload',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-launch-'));
  const project=path.join(scratch,'project');fs.cpSync(path.join(ROOT,'fixtures/okp-yu7-ppt'),project,{recursive:true});
  const {base,server}=await startServer(project);
  let browser;
  try{
    browser=await launchPinnedChromium({headless:true});
    const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await mockKernelCatchAll(page);
    await mockProviders(page);
    const intentGate=deferred();const intents=[];const creates=[];
    await page.route('**/slides/assistant-intent',async route=>{intents.push(route.request().postDataJSON());await intentGate.promise;await route.fulfill({json:{ok:true,intent:'generate',scope:'deck',pages:[]}});});
    await page.route('**/slides/sessions',async route=>{
      if(route.request().method()!=='POST')return route.continue();
      creates.push(route.request().postDataJSON());
      await route.fulfill({json:{ok:true,sessionId:'launch-test',projectPath:project}});
    });
    const activity={ok:true,sessionId:'launch-test',brief:BRIEF,phase:'planning',agentStatus:'busy',provider:{providerId:'test',modelId:'cheap'},project:{path:project,title:'Launch',pageCount:0,pagePaths:[]},stages:[],inspection:{pages:[]},events:[],conversation:{version:1,mode:'generate',messages:[{id:'u1',at:'2026-09-23T01:00:00Z',text:BRIEF,mode:'generate'}]}};
    await page.route('**/api/generation-activity**',route=>route.fulfill({json:activity}));
    await page.route('**/slides/state/launch-test',route=>route.fulfill({json:{agentStatus:'busy',binding:{dshSessionId:'launch-test'},phase:{kind:'planning'}}}));
    await page.route('**/slides/sessions/launch-test/events',route=>route.abort());

    await page.goto(`${base}/`,{waitUntil:'networkidle'});
    await page.fill('#brief',BRIEF);
    await page.waitForFunction(()=>!document.getElementById('btn-send').disabled);
    await page.click('#btn-send');
    // The intent read is held open: the editor and the message must appear
    // while it is still pending, not after the model answers.
    await page.waitForURL(/index\.html\?launch=/,{timeout:10000});
    await page.waitForSelector('#workspace-cover:not([hidden]) #workspace-cover-brief:not([hidden])',{timeout:10000});
    assert.equal(await page.locator('#workspace-cover-brief').innerText(),BRIEF);
    assert.match(await page.locator('#workspace-cover-detail').innerText(),/理解你的需求/);
    assert.equal(await page.locator('#workspace-cover-steps li[aria-current="step"]').innerText(),'理解需求');
    assert.equal(creates.length,0,'no session before the intent read returns');
    assert.equal(intents.length,1);
    assert.equal(intents[0].modelSelection.provider,'test');
    await page.evaluate(()=>{window.__samePage=true;});

    intentGate.resolve();
    await page.waitForURL(/session=launch-test/,{timeout:5000});
    const url=new URL(page.url());
    assert.equal(url.searchParams.get('project'),project);
    assert.equal(url.searchParams.get('live'),'1');
    assert.equal(url.searchParams.get('workspace'),'1');
    assert.equal(url.searchParams.get('launch'),null);
    assert.equal(await page.evaluate(()=>window.__samePage),true,'handoff must not reload the page');
    assert.equal(creates.length,1);
    assert.equal(creates[0].conversationMode,'generate');
    assert.equal(creates[0].brief,BRIEF);
    await page.waitForSelector('#workspace-cover',{state:'hidden',timeout:8000});

    // A reload of the bound page must not create a second session.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForTimeout(500);
    assert.equal(creates.length,1);
    assert.deepEqual(errors,[]);
  }finally{
    await browser?.close();server.kill();fs.rmSync(scratch,{recursive:true,force:true});
  }
});

test('a failed launch keeps the message, offers retry, and hands the draft back to the Hub',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-launch-fail-'));
  const project=path.join(scratch,'project');fs.cpSync(path.join(ROOT,'fixtures/okp-yu7-ppt'),project,{recursive:true});
  const {base,server}=await startServer(project);
  let browser;
  try{
    browser=await launchPinnedChromium({headless:true});
    const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await mockKernelCatchAll(page);
    await mockProviders(page);
    let intentCalls=0;
    await page.route('**/slides/assistant-intent',route=>{intentCalls+=1;return route.fulfill({status:503,json:{error:'模型服务暂时不可达，输入内容已保留。'}});});
    let creates=0;
    await page.route('**/slides/sessions',route=>{if(route.request().method()==='POST')creates+=1;return route.fulfill({status:500,json:{error:'should not be called'}});});

    await page.goto(`${base}/`,{waitUntil:'networkidle'});
    await page.fill('#brief',BRIEF);
    await page.waitForFunction(()=>!document.getElementById('btn-send').disabled);
    await page.click('#btn-send');
    await page.waitForSelector('#workspace-cover.is-failed');
    assert.match(await page.locator('#workspace-cover-detail').innerText(),/暂时不可达/);
    assert.equal(await page.locator('#workspace-cover-brief').innerText(),BRIEF);
    assert.equal(await page.locator('#workspace-cover').getAttribute('role'),'alert');
    assert.equal(creates,0);

    await page.click('#workspace-cover .launch-retry');
    for(let i=0;i<50&&intentCalls<2;i++)await new Promise(r=>setTimeout(r,100));
    assert.equal(intentCalls,2,'retry re-runs the intent read');
    await page.waitForSelector('#workspace-cover.is-failed .launch-retry');
    assert.equal(await page.locator('#workspace-cover .launch-retry').count(),1,'one retry after the second failure');

    await page.click('#workspace-cover .launch-back');
    // #brief is static markup; the deferred hub.js restores the draft and then
    // drops ?draft= from the URL, so wait for that before reading the field.
    await page.waitForURL(url=>url.pathname==='/'&&!url.searchParams.has('draft'),{timeout:5000});
    assert.equal(await page.inputValue('#brief'),BRIEF,'the Hub restores the draft');
    assert.deepEqual(errors,[]);
  }finally{
    await browser?.close();server.kill();fs.rmSync(scratch,{recursive:true,force:true});
  }
});

test('a live kernel answers the boot probes through the real proxy (no route mocks)',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-launch-live-'));
  const project=path.join(scratch,'project');fs.cpSync(path.join(ROOT,'fixtures/okp-yu7-ppt'),project,{recursive:true});
  const {port:kernelPort,kernel}=await startFakeKernel();
  const {base,server}=await startServer(project,kernelPort);
  let browser;
  try{
    browser=await launchPinnedChromium({headless:true});
    const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // No page.route at all: /slides/* and /plugins/* are proxied to the kernel
    // by server.mjs, exactly as production serves them.
    await page.goto(`${base}/`,{waitUntil:'networkidle'});
    await page.fill('#brief',BRIEF);
    await page.waitForFunction(()=>!document.getElementById('btn-send').disabled,{timeout:10000});
    assert.equal(await page.locator('#brief').inputValue(),BRIEF);
    assert.deepEqual(errors,[]);
  }finally{
    await browser?.close();server.kill();kernel.close();fs.rmSync(scratch,{recursive:true,force:true});
  }
});

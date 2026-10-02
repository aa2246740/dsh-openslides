import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {ensureRunLedger,recordPageRevision,currentPageRevision,stableSha256,recordTodo} from '../../../packages/presentation-run/dist/index.js';
import {executeGenerateTool,persistWrittenPages} from '../../../packages/presentation-run/dist/domain/agent-tools.js';
import {loadPlaybook} from '../../../packages/presentation-run/dist/domain/playbook.js';
import {loadProject} from '../../../packages/pptd-v2/dist/index.js';
import {launchPinnedChromium} from '../../../scripts/lib/pinned-playwright.mjs';
const ROOT=path.resolve(fileURLToPath(new URL('.',import.meta.url)),'../../..');

function textEl(id,text,bounds,fontSize){
  return {elementId:id,elementType:'text',bounds,content:{text,fontSize,color:'#14355C'}};
}
function newPage(id,title){
  return {id,pageType:'content',elements:[
    {elementId:`${id}-bg`,elementType:'shape',shapeName:'rect',bounds:[0,0,960,540],fill:{type:'solid',color:'#F7F4EC'}},
    textEl(`${id}-t`,title,[80,160,800,80],36),
  ]};
}

test('a structural turn inserts a page at insertIndex through the real lock, persist and verify chain',async()=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-structure-'));
 const project=path.join(scratch,'project');fs.mkdirSync(path.join(project,'pages'),{recursive:true});
 const pagePaths=['pages/1_cover.page','pages/2_tips.page','pages/3_keep.page'];
 fs.writeFileSync(path.join(project,'deck.pptd'),JSON.stringify({version:'v2',title:'Structure QA',size:[960,540],theme:{},pages:pagePaths}));
 for(const [i,p] of pagePaths.entries())fs.writeFileSync(path.join(project,p),JSON.stringify({pageType:'content',background:{type:'solid',color:'#F7F4EC'},elements:[{elementId:'title',elementType:'text',bounds:[80,80,800,60],content:{text:`Test page ${i+1}`,fontSize:32,color:'#14355C'}}]}));
 ensureRunLedger(project,{manifestSha256:'a'.repeat(64),requirementsId:'b'.repeat(64),requirements:[]});
 const recordPages=()=>{for(const entry of loadProject(project).pages)recordPageRevision(project,{contextEpochId:'structure-test'},path.basename(entry.path,'.page'),entry.page);};
 recordPages();
 const port=await new Promise(resolve=>{const p=net.createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n));});});
 const base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),OPEN_SLIDESTUDIO_PROJECT:project,SLIDESTUDIO_RETENTION_DAYS:'0'},stdio:'ignore'});
 const out=process.env.SLIDESTUDIO_QA_OUTPUT_DIR || path.join(ROOT,'output/structure-edit-acceptance-2026-09-22');fs.mkdirSync(out,{recursive:true});
 let browser,page;
 try{
  for(let i=0;i<80;i++){try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await launchPinnedChromium({headless:true});
  page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[],turns=[],locks=[],dialogs=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(`console:${m.text()}`);});
  page.on('dialog',d=>{dialogs.push(d.message());void d.accept();});
  let busy=false;
  const livePages=()=>loadProject(project).pages.map(entry=>path.basename(entry.path,'.page'));
  const state=()=>({agentStatus:busy?'busy':'idle',phase:{kind:'page-ready'},inspection:{pages:livePages().map(pageId=>({pageId,...currentPageRevision(project,pageId)}))}});
  let statePolls=0;const polledPages=[];const pollsWhileBusy=()=>{const seen=statePolls;return async()=>{for(let i=0;i<200&&statePolls<=seen;i++)await new Promise(r=>setTimeout(r,30));};};
  const activity={ok:true,sessionId:'structure-test',brief:'加一页',phase:'edited',agentStatus:'idle',provider:{providerId:'test',modelId:'cheap'},project:{path:project,title:'Structure QA',pageCount:3,pagePaths},stages:[],events:[{id:'old-reply',kind:'message',at:'2026-09-20T00:00:00Z',detail:'文稿已准备好。',status:'complete'}],conversation:{version:1,mode:'edit',messages:[]}};
  await page.route('**/api/generation-activity**',async route=>{const data=await (await route.fetch()).json();await route.fulfill({json:{...activity,...state(),assistantArtifacts:data.assistantArtifacts,phase:busy?'reviewing':'edited'}});});
  await page.route('**/slides/providers',route=>route.fulfill({json:{providers:[{id:'test',name:'Test',ready:true,models:['cheap']}]}}));
  await page.route('**/slides/state/structure-test',route=>{statePolls+=1;const s=state();polledPages.push(s.inspection.pages.map(p=>p.pageId));return route.fulfill({json:s});});
  await page.route('**/slides/sessions/structure-test/events',route=>route.abort());
  let intentCalls=0;
  await page.route('**/slides/assistant-intent',route=>{
   intentCalls+=1;
   const text=String(route.request().postDataJSON()?.text||'');
   if(/并改/.test(text))return route.fulfill({json:{ok:true,intent:'edit',scope:'deck',pages:[],structureOnly:true,insertIndex:4,editablePages:[2]}});
   if(/顺便/.test(text))return route.fulfill({json:{ok:true,intent:'edit',scope:'deck',pages:[],structureOnly:true,insertIndex:4,editablePages:[2],addCount:1}});
   if(/删掉第3页/.test(text))return route.fulfill({json:{ok:true,intent:'edit',scope:'deck',pages:[],structureOnly:true,deletablePages:[3]}});
   if(/第2页也删/.test(text))return route.fulfill({json:{ok:true,intent:'edit',scope:'deck',pages:[],structureOnly:true,deletablePages:[2]}});
   if(/第3页挪到最前/.test(text))return route.fulfill({json:{ok:true,intent:'edit',scope:'deck',pages:[],structureOnly:true,reorderTo:[3,1,2,4]}});
   if(/最后一页挪到最前/.test(text))return route.fulfill({json:{ok:true,intent:'edit',scope:'deck',pages:[],structureOnly:true,reorderTo:[4,1,2,3]}});
   if(/推翻重做|重写整份/.test(text))return route.fulfill({json:{ok:true,intent:'edit',scope:'deck',pages:[],rewrite:true}});
   if(/文稿标题/.test(text))return route.fulfill({json:{ok:true,intent:'edit',scope:'current',pages:[],editableMeta:['title']}});
   if(/微调当前页/.test(text))return route.fulfill({json:{ok:true,intent:'edit',scope:'current',pages:[]}});
   return route.fulfill({json:{ok:true,intent:'edit',scope:'deck',pages:[],structureOnly:true,insertIndex:1}});
  });
  let lockCalls=0;
  await page.route('**/api/reviews/ai-lock?**',async route=>{lockCalls+=1;const body=route.request().postDataJSON();if(body?.workspaceEdit)locks.push(body);const response=await route.fetch();await route.fulfill({response});});
  const verifies=[];await page.route('**/api/reviews/ai-lock/verify?**',async route=>{const response=await route.fetch();const data=await response.json();verifies.push(data);await route.fulfill({response,json:data});});
  await page.route('**/slides/sessions/structure-test/stop',route=>{busy=false;return route.fulfill({json:{ok:true,stopped:true}});});
  await page.route('**/slides/sessions/structure-test/turn',async route=>{
   const body=route.request().postDataJSON();turns.push(body);
   const userMessage={id:`u${turns.length}`,at:new Date().toISOString(),text:body.userText,mode:'edit',clientRequestId:body.clientRequestId};
   activity.conversation.messages.push(userMessage);fs.mkdirSync(path.join(project,'_agent'),{recursive:true});fs.writeFileSync(path.join(project,'_agent/assistant-conversation.v1.json'),JSON.stringify(activity.conversation));busy=true;
   await route.fulfill({json:{ok:true,userMessage}});
  });
  const writerState=()=>({brief:'结构验收',playbook:loadPlaybook({hostDefaults:false}),todos:[],researchNotes:[],writtenPages:[],projectRoot:project});
  const shaOf=(entry)=>stableSha256({id:path.basename(entry.path,'.page'),...entry.page});
  const baselineSha=()=>Object.fromEntries(loadProject(project).pages.map(entry=>[entry.path,shaOf(entry)]));
  await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=1`,{waitUntil:'domcontentloaded'});
  // The workspace cover holds input until the editor layout is stable.
  await page.waitForSelector('#workspace-cover',{state:'hidden'});
  await page.getByRole('button',{name:'第 3 页',exact:true}).click();
  const input=page.getByLabel('与 AI 协作',{exact:true});
  const beforeSha=baselineSha();
  // Turn 1: insert a new page between page 1 and page 2.
  await input.fill('在第1页后面加一页');await input.press('Enter');
  for(let i=0;i<100&&turns.length===0;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,1,`turn never dispatched: cards=${await page.evaluate(()=>[...document.querySelectorAll('.generation-message-card,#assistant-feedback,.toast')].map(e=>e.textContent).join(' | ').slice(0,400))} errs=${JSON.stringify(errors)} intents=${intentCalls} lockCalls=${lockCalls}`);
  assert.equal(locks[0].workspaceEdit.kind,'deck');
  assert.equal(locks[0].workspaceEdit.structureOnly,true);
  assert.equal(locks[0].workspaceEdit.insertIndex,1);
  assert.deepEqual(locks[0].workspaceEdit.targetPages.map(p=>p.pageId),['1_cover','2_tips','3_keep']);
  // Simulated agent: the real guard file authorizes one new page via the real persist path.
  const written=persistWrittenPages(writerState(),[newPage('new_intro','新增的目录页')]);
  assert.equal(written.ok,true,JSON.stringify(written));
  recordPageRevision(project,{contextEpochId:'structure-test',commandId:'structure-test-write'},'new_intro',loadProject(project).pages.find(e=>e.path==='pages/new_intro.page').page);
  activity.events.push({id:'reply-1',kind:'message',at:new Date(Date.now()+10).toISOString(),detail:'已在第 1 页后新增一页目录。',status:'complete'});
  // The client must observe agentStatus=busy at least once before the turn
  // ends, otherwise its no-change detector cannot distinguish "finished with
  // zero writes" from "never started".
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  await page.locator('.generation-message-card').filter({hasText:'已在第 1 页后新增一页目录'}).getByRole('button',{name:'查看修改前'}).waitFor();
  const after=loadProject(project);
  assert.deepEqual(after.pages.map(e=>e.path),['pages/1_cover.page','pages/new_intro.page','pages/2_tips.page','pages/3_keep.page'],'new page sits exactly at insertIndex');
  // Serialization may normalize untouched files; the verify invariant is the
  // semantic page hash, which must be identical for every baseline page.
  for(const [p,sha] of Object.entries(beforeSha))assert.equal(shaOf(after.pages.find(e=>e.path===p)),sha,`baseline ${p} content must be unchanged`);
  // Turn 2: a structural lock whose "agent" mutates an existing page must verify-fail and roll back.
  await input.fill('再加一页');await input.press('Enter');
  for(let i=0;i<100&&turns.length<2;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,2);
  const tipsEntry=loadProject(project).pages.find(e=>e.path==='pages/2_tips.page');
  const tipsSha=stableSha256({id:'2_tips',...tipsEntry.page});
  const malicious=persistWrittenPages(writerState(),[{...newPage('2_tips','篡改现有页'),id:'2_tips'}],{expectedPageSha256:tipsSha});
  assert.equal(malicious.ok,false,'persist must reject rewriting a baseline page under a structural lock');
  assert.equal(malicious.error,'review_scope_violation');
  // Simulate a writer that bypasses the persist gate anyway (host bug class): the verify gate must still catch it.
  const hackProject=loadProject(project);
  const hackPage=hackProject.pages.find(e=>e.path==='pages/2_tips.page');
  hackPage.page.elements[0].content.text='被篡改';
  const {saveProject}=await import('../../../packages/pptd-v2/dist/index.js');
  saveProject(hackProject);
  recordPageRevision(project,{contextEpochId:'structure-test',commandId:'structure-test-hack'},'2_tips',hackPage.page);
  activity.events.push({id:'reply-2',kind:'message',at:new Date(Date.now()+20).toISOString(),detail:'已完成。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const restored=loadProject(project);
  assert.equal(shaOf(restored.pages.find(e=>e.path==='pages/2_tips.page')),beforeSha['pages/2_tips.page'],'verify failure must restore the baseline page content');
  assert.equal(restored.pages.length,4,'the earlier accepted insertion stays; only the violating turn rolls back');
  assert.equal(fs.existsSync(path.join(project,'_agent/ai-review-lock.v1.json')),false,'guard released after the failed turn settles');
  // Turn 3: compound structural — add one page AND edit the whitelisted page
  // at position 2 (which is new_intro after the turn-1 insertion; page ids are
  // not position numbers).
  await input.fill('末尾加一页总结，顺便把第2页标题改大');await input.press('Enter');
  for(let i=0;i<100&&turns.length<3;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,3);
  assert.deepEqual(locks[2].workspaceEdit.editablePageIds,['new_intro'],'lock carries the editable whitelist');
  assert.equal(locks[2].workspaceEdit.expectedAddCount,1,'lock carries the exact add count');
  const compoundNew=persistWrittenPages(writerState(),[newPage('n_summary','总结页')]);
  assert.equal(compoundNew.ok,true,JSON.stringify(compoundNew));
  const introNow=loadProject(project).pages.find(e=>e.path==='pages/new_intro.page');
  const editedIntro={...introNow.page,elements:[...introNow.page.elements,textEl('intro-extra','改大的标题',[80,300,800,50],28)]};
  const compoundEdit=persistWrittenPages(writerState(),[{...editedIntro,id:'new_intro'}],{expectedPageSha256:shaOf(introNow)});
  assert.equal(compoundEdit.ok,true,JSON.stringify(compoundEdit));
  recordPageRevision(project,{contextEpochId:'structure-test',commandId:'structure-test-t3a'},'n_summary',loadProject(project).pages.find(e=>e.path==='pages/n_summary.page').page);
  recordPageRevision(project,{contextEpochId:'structure-test',commandId:'structure-test-t3b'},'new_intro',editedIntro);
  activity.events.push({id:'reply-3',kind:'message',at:new Date(Date.now()+30).toISOString(),detail:'已新增总结页并改大第 2 页标题。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const compound=loadProject(project);
  assert.deepEqual(compound.pages.map(e=>e.path),['pages/1_cover.page','pages/new_intro.page','pages/2_tips.page','pages/3_keep.page','pages/n_summary.page'],'compound turn appends and keeps baseline order');
  assert.match(JSON.stringify(compound.pages.find(e=>e.path==='pages/new_intro.page').page),/改大的标题/,'whitelisted page edit persisted');
  const frozen={'pages/1_cover.page':beforeSha['pages/1_cover.page'],'pages/2_tips.page':beforeSha['pages/2_tips.page'],'pages/3_keep.page':beforeSha['pages/3_keep.page']};
  for(const [p,sha] of Object.entries(frozen))assert.equal(shaOf(compound.pages.find(e=>e.path===p)),sha,`non-whitelisted ${p} stays frozen`);
  // Turn 4: a compound lock whose "agent" edits the whitelist but skips the add must fail verify.
  await input.fill('末尾再加一页并改第2页');await input.press('Enter');
  for(let i=0;i<100&&turns.length<4;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,4);
  assert.deepEqual(locks[3].workspaceEdit.editablePageIds,['new_intro']);
  assert.equal(locks[3].workspaceEdit.expectedAddCount,undefined,'vague count stays unset');
  const introBefore4=shaOf(loadProject(project).pages.find(e=>e.path==='pages/new_intro.page'));
  const skipAddEdit={...editedIntro,elements:[...editedIntro.elements,textEl('intro-more','又被改了一次',[80,360,800,50],24)]};
  const skipAdd=persistWrittenPages(writerState(),[{...skipAddEdit,id:'new_intro'}],{expectedPageSha256:introBefore4});
  assert.equal(skipAdd.ok,true,'the whitelisted write itself is allowed');
  recordPageRevision(project,{contextEpochId:'structure-test',commandId:'structure-test-t4'},'new_intro',skipAddEdit);
  activity.events.push({id:'reply-4',kind:'message',at:new Date(Date.now()+40).toISOString(),detail:'已修改第 2 页。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const rolledBack=loadProject(project);
  assert.equal(shaOf(rolledBack.pages.find(e=>e.path==='pages/new_intro.page')),introBefore4,'a compound turn that skips the add rolls back the whitelisted edit too');
  assert.equal(rolledBack.pages.length,5,'no page was added and nothing was lost');
  // Turn 5: pure deletion — "删掉第3页" authorizes removing the page at
  // position 3 (2_tips in the current manifest). The real delete_pages tool
  // removes the file and manifest entry; verify accepts the exact removal.
  await input.fill('删掉第3页');await input.press('Enter');
  for(let i=0;i<100&&turns.length<5;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,5);
  assert.deepEqual(locks[4].workspaceEdit.deletablePageIds,['2_tips'],'position 3 resolves to 2_tips');
  assert.equal(dialogs.length,1,'deletion asks the user once before the snapshot');
  assert.match(dialogs[0],/2_tips/,'the confirm names the page being deleted');
  assert.equal(locks[4].workspaceEdit.insertIndex,undefined,'a pure delete carries no add authorization');
  const del=executeGenerateTool('delete_pages',{pageIds:['2_tips']},writerState());
  assert.equal(del.ok,true,JSON.stringify(del));
  assert.equal(fs.existsSync(path.join(project,'pages/2_tips.page')),false,'page file removed');
  activity.events.push({id:'reply-5',kind:'message',at:new Date(Date.now()+50).toISOString(),detail:'已删除第 3 页。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const afterDelete=loadProject(project);
  const turnError=await page.evaluate(()=>[...document.querySelectorAll('.generation-message-card,.toast,#assistant-feedback')].map(e=>e.textContent).join(' | ').slice(0,600));
  assert.deepEqual(afterDelete.pages.map(e=>e.path),['pages/1_cover.page','pages/new_intro.page','pages/3_keep.page','pages/n_summary.page'],`manifest shrinks to the survivors in order; verify=${JSON.stringify(verifies.at(-1))} err=${turnError}`);
  // Turn 6: a delete lock that removes an UNAUTHORIZED page must verify-fail
  // and roll back — including restoring the deleted file from the snapshot.
  await input.fill('把第2页也删掉');await input.press('Enter');
  for(let i=0;i<100&&turns.length<6;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,6);
  assert.deepEqual(locks[5].workspaceEdit.deletablePageIds,['new_intro'],'position 2 is new_intro now');
  // Rogue writer bypasses delete_pages and removes 3_keep straight off disk.
  const rogue=loadProject(project);
  rogue.pages=rogue.pages.filter(e=>e.path!=='pages/3_keep.page');
  rogue.presentation.pages=rogue.pages.map(e=>e.path);
  saveProject(rogue);
  fs.rmSync(path.join(project,'pages/3_keep.page'),{force:true});
  activity.events.push({id:'reply-6',kind:'message',at:new Date(Date.now()+60).toISOString(),detail:'已完成。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const restoredDelete=loadProject(project);
  assert.deepEqual(restoredDelete.pages.map(e=>e.path),['pages/1_cover.page','pages/new_intro.page','pages/3_keep.page','pages/n_summary.page'],'unauthorized removal rolls back to the verified manifest');
  assert.equal(fs.existsSync(path.join(project,'pages/3_keep.page')),true,'the wrongfully deleted file is restored');
  assert.equal(fs.existsSync(path.join(project,'_agent/ai-review-lock.v1.json')),false,'guard released');
  // Turn 7: pure reorder — "把第3页挪到最前面" authorizes exactly one new
  // manifest order. reorder_pages moves no file and no content; verify must
  // accept the order alone as the turn's change.
  await input.fill('把第3页挪到最前面');await input.press('Enter');
  for(let i=0;i<100&&turns.length<7;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,7);
  assert.deepEqual(locks[6].workspaceEdit.reorderPageIds,['3_keep','1_cover','new_intro','n_summary'],'reorderTo resolves positions to page ids in order');
  assert.equal(locks[6].workspaceEdit.insertIndex,undefined,'a reorder carries no add authorization');
  const reorder=executeGenerateTool('reorder_pages',{pageIds:['3_keep','1_cover','new_intro','n_summary']},writerState());
  assert.equal(reorder.ok,true,JSON.stringify(reorder));
  activity.events.push({id:'reply-7',kind:'message',at:new Date(Date.now()+70).toISOString(),detail:'已把第 3 页挪到最前面。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const afterReorder=loadProject(project);
  assert.deepEqual(afterReorder.pages.map(e=>e.path),['pages/3_keep.page','pages/1_cover.page','pages/new_intro.page','pages/n_summary.page'],'manifest order is exactly the authorized permutation');
  // Turn 8: a reorder lock whose "agent" writes a different order must fail
  // verify and roll back to the authorized outcome.
  await input.fill('把最后一页挪到最前面');await input.press('Enter');
  for(let i=0;i<100&&turns.length<8;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,8);
  assert.deepEqual(locks[7].workspaceEdit.reorderPageIds,['n_summary','3_keep','1_cover','new_intro']);
  const rogueOrder=loadProject(project);
  rogueOrder.pages=[...rogueOrder.pages].reverse();
  rogueOrder.presentation.pages=rogueOrder.pages.map(e=>e.path);
  saveProject(rogueOrder);
  activity.events.push({id:'reply-8',kind:'message',at:new Date(Date.now()+80).toISOString(),detail:'已完成。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const restoredOrder=loadProject(project);
  assert.deepEqual(restoredOrder.pages.map(e=>e.path),['pages/3_keep.page','pages/1_cover.page','pages/new_intro.page','pages/n_summary.page'],'an unauthorized order verify-fails and restores the previous manifest');
  // Turn 9: full rewrite — the user confirms the wipe, the agent commits a new
  // plan via write_todo (recordTodo is what the strict domain hand writes), the
  // new pages append, leftovers are deleted, and verify pins manifest == plan.
  await input.fill('完全推翻重做这份PPT');await input.press('Enter');
  for(let i=0;i<100&&turns.length<9;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,9);
  assert.equal(locks[8].workspaceEdit.rewrite,true,'the rewrite flag rides the lock');
  assert.equal(locks[8].workspaceEdit.structureOnly,undefined,'a rewrite is not a structural lock');
  assert.equal(locks[8].workspaceEdit.insertIndex,undefined);
  assert.deepEqual(locks[8].workspaceEdit.targetPages.map(p=>p.pageId),['3_keep','1_cover','new_intro','n_summary'],'rewrite authorizes every baseline page');
  assert.equal(dialogs.length,3,'rewrite asked its own confirmation (deletion asked twice earlier)');
  assert.match(dialogs[2],/推翻|重写/,'the rewrite confirm says the deck is being replaced');
  const planItems=[
    {pageId:'r_cover',title:'新封面',layoutFamily:'cover',exhibits:[]},
    {pageId:'r_body',title:'新内容页',layoutFamily:'content',exhibits:[]},
  ];
  const committed=recordTodo(project,{contextEpochId:'structure-test'},planItems);
  assert.deepEqual(committed.map(p=>p.pageId),['r_cover','r_body']);
  assert.equal(persistWrittenPages(writerState(),[newPage('r_cover','新封面')]).ok,true);
  assert.equal(persistWrittenPages(writerState(),[newPage('r_body','新内容页')]).ok,true);
  // The plan drops every baseline page — the rewrite lock lets delete_pages take them all.
  const wipe=executeGenerateTool('delete_pages',{pageIds:['3_keep','1_cover','new_intro','n_summary']},writerState());
  assert.equal(wipe.ok,true,JSON.stringify(wipe));
  recordPageRevision(project,{contextEpochId:'structure-test',commandId:'structure-test-rw1'},'r_cover',loadProject(project).pages.find(e=>e.path==='pages/r_cover.page').page);
  recordPageRevision(project,{contextEpochId:'structure-test',commandId:'structure-test-rw2'},'r_body',loadProject(project).pages.find(e=>e.path==='pages/r_body.page').page);
  activity.events.push({id:'reply-9',kind:'message',at:new Date(Date.now()+90).toISOString(),detail:'已按新大纲重写整份文稿。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const rewritten=loadProject(project);
  const dbg=await page.evaluate(()=>[...document.querySelectorAll('.generation-message-card,.toast,#assistant-feedback')].map(e=>e.textContent).slice(-2).join(' | ').slice(0,500));
  assert.deepEqual(rewritten.pages.map(e=>e.path),['pages/r_cover.page','pages/r_body.page'],`rewrite verify pins manifest to the committed plan; verify=${JSON.stringify(verifies.at(-1))} verifies=${verifies.length} card=${dbg}`);
  assert.equal(verifies.at(-1).rewriteMismatch,false,'manifest matched the committed plan');
  assert.equal(fs.existsSync(path.join(project,'pages/3_keep.page')),false,'dropped baseline pages are gone after an accepted rewrite');
  // Turn 10: a rewrite whose manifest does not equal the committed plan must
  // roll back — including restoring a page the agent wrongly deleted.
  await input.fill('重写整份文稿');await input.press('Enter');
  for(let i=0;i<100&&turns.length<10;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,10);
  assert.equal(locks[9].workspaceEdit.rewrite,true);
  recordTodo(project,{contextEpochId:'structure-test'},[
    {pageId:'x1',title:'X1',layoutFamily:'cover',exhibits:[]},
    {pageId:'x2',title:'X2',layoutFamily:'content',exhibits:[]},
  ]);
  assert.equal(persistWrittenPages(writerState(),[newPage('x1','只写了一页')]).ok,true);
  const badDelete=executeGenerateTool('delete_pages',{pageIds:['r_body']},writerState());
  assert.equal(badDelete.ok,true,'the rewrite lock allows dropping any baseline page');
  activity.events.push({id:'reply-10',kind:'message',at:new Date(Date.now()+100).toISOString(),detail:'已完成。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const rolledBackRewrite=loadProject(project);
  assert.equal(verifies.at(-1).rewriteMismatch,true,'manifest [r_cover,x1] never equals plan [x1,x2]');
  assert.deepEqual(rolledBackRewrite.pages.map(e=>e.path),['pages/r_cover.page','pages/r_body.page'],'a plan/manifest mismatch restores the whole pre-rewrite deck');
  assert.equal(fs.existsSync(path.join(project,'pages/r_body.page')),true,'the wrongly deleted page file is restored');
  assert.equal(fs.existsSync(path.join(project,'pages/x1.page')),false,'the orphan page written this turn is removed');
  assert.equal(fs.existsSync(path.join(project,'_agent/ai-review-lock.v1.json')),false,'guard released');
  // Turn 11: an editableMeta lock authorizes the deck title — update_deck
  // applies it, no page moves, and verify accepts the metadata-only turn.
  await input.fill('把文稿标题改成季度总结');await input.press('Enter');
  for(let i=0;i<100&&turns.length<11;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,11);
  assert.deepEqual(locks[10].workspaceEdit.editableMeta,['title'],'the meta grant rides the lock');
  assert.equal(locks[10].workspaceEdit.metaOnly,true,'a current-scope meta request takes the least-privilege metaOnly lock');
  const metaWrite=executeGenerateTool('update_deck',{title:'季度总结'},writerState());
  assert.equal(metaWrite.ok,true,JSON.stringify(metaWrite));
  assert.equal(loadProject(project).presentation.title,'季度总结');
  activity.events.push({id:'reply-11',kind:'message',at:new Date(Date.now()+110).toISOString(),detail:'已把文稿标题改为季度总结。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const afterMeta=loadProject(project);
  assert.equal(afterMeta.presentation.title,'季度总结','the authorized rename survives verify');
  assert.deepEqual(verifies.at(-1).changedMetaFields,['title'],'verify reports the authorized meta change');
  assert.equal(verifies.at(-1).scopeViolation,false,'an authorized title change is not a violation');
  // Turn 12: a plain page lock WITHOUT editableMeta whose writer edits the
  // target page AND renames the deck anyway must verify-fail — the page edit
  // is legitimate but the unauthorized title move is a scope violation.
  await input.fill('微调当前页');await input.press('Enter');
  for(let i=0;i<100&&turns.length<12;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,12);
  assert.equal(locks[11].workspaceEdit.editableMeta,undefined,'no meta grant on this lock');
  const anchorId=String(locks[11].workspaceEdit.targetPages[0].pageId);
  const anchorEntry=loadProject(project).pages.find(e=>e.path===`pages/${anchorId}.page`);
  const anchorSha=shaOf(anchorEntry);
  const legitEdit={...anchorEntry.page,elements:[...anchorEntry.page.elements,textEl('meta-x','微调',[80,300,800,50],24)]};
  assert.equal(persistWrittenPages(writerState(),[{...legitEdit,id:anchorId}],{expectedPageSha256:anchorSha}).ok,true);
  recordPageRevision(project,{contextEpochId:'structure-test',commandId:'structure-test-t12'},anchorId,legitEdit);
  const rogueMeta=loadProject(project);
  rogueMeta.presentation.title='越权标题';
  saveProject(rogueMeta);
  activity.events.push({id:'reply-12',kind:'message',at:new Date(Date.now()+120).toISOString(),detail:'已完成。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const restoredMeta=loadProject(project);
  assert.equal(restoredMeta.presentation.title,'季度总结','an unauthorized rename rolls back to the verified title');
  assert.equal(verifies.at(-1).scopeViolation,true,'verify flags the unauthorized title change');
  assert.equal(shaOf(restoredMeta.pages.find(e=>e.path===`pages/${anchorId}.page`)),anchorSha,'the in-target page edit rolls back with it');
  // Turn 13: a metaOnly lock whose writer ALSO writes the anchor page —
  // the authorized title change AND the unauthorized page write roll back
  // together; under metaOnly even the anchor page is frozen.
  await input.fill('把文稿标题改成最终版');await input.press('Enter');
  for(let i=0;i<100&&turns.length<13;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(turns.length,13);
  assert.equal(locks[12].workspaceEdit.metaOnly,true,'the second meta request is also metaOnly');
  const metaAnchorId=String(locks[12].workspaceEdit.targetPages[0].pageId);
  const metaAnchorEntry=loadProject(project).pages.find(e=>e.path===`pages/${metaAnchorId}.page`);
  const metaAnchorSha=shaOf(metaAnchorEntry);
  const titleBefore13=loadProject(project).presentation.title;
  const metaWrite13=executeGenerateTool('update_deck',{title:'最终版'},writerState());
  assert.equal(metaWrite13.ok,true,JSON.stringify(metaWrite13));
  const roguePage={...metaAnchorEntry.page,elements:[...metaAnchorEntry.page.elements,textEl('rogue-x','顺手改',[60,320,800,50],20)]};
  assert.equal(persistWrittenPages(writerState(),[{...roguePage,id:metaAnchorId}],{expectedPageSha256:metaAnchorSha}).ok,true);
  recordPageRevision(project,{contextEpochId:'structure-test',commandId:'structure-test-t13'},metaAnchorId,roguePage);
  activity.events.push({id:'reply-13',kind:'message',at:new Date(Date.now()+130).toISOString(),detail:'已完成。',status:'complete'});
  await pollsWhileBusy()();busy=false;
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('slides.pending-edit:')),undefined,{timeout:20000});
  const restored13=loadProject(project);
  assert.equal(restored13.presentation.title,titleBefore13,'the authorized rename rolls back with the unauthorized page write');
  assert.equal(verifies.at(-1).scopeViolation,true,'metaOnly verify flags the anchor page move');
  assert.equal(shaOf(restored13.pages.find(e=>e.path===`pages/${metaAnchorId}.page`)),metaAnchorSha,'the anchor page is byte-restored');
  assert.equal(fs.existsSync(path.join(project,'_agent/ai-review-lock.v1.json')),false,'guard released');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'structure-dom-proof.json'),JSON.stringify({
    lockKind:locks[0].workspaceEdit.kind,structureOnly:locks[0].workspaceEdit.structureOnly,insertIndex:locks[0].workspaceEdit.insertIndex,
    order:after.pages.map(e=>e.path),
    baselineUnchanged:pagePaths.every(p=>shaOf(restored.pages.find(e=>e.path===p))===beforeSha[p]),
    violationRejected:malicious.error,restoredAfterViolation:true,
    compound:{editablePageIds:locks[2].workspaceEdit.editablePageIds,expectedAddCount:locks[2].workspaceEdit.expectedAddCount,whitelistedEditPersisted:true,skipAddRolledBack:true},
    deletion:{deletablePageIds:locks[4].workspaceEdit.deletablePageIds,accepted:true,unauthorizedRemovalRolledBack:true},
    checks:['structural intent reaches the real lock with insertIndex','persistWrittenPages inserts without CAS and keeps baseline bytes','verify accepts exactly the new page at insertIndex','baseline mutation is scope violation and rolls back','compound lock whitelists one baseline page while others stay frozen','a compound turn without any added page fails verify and rolls back','delete_pages removes exactly the authorized page and the manifest shrinks','an unauthorized removal verify-fails and restores the deleted file','reorder applies only the authorized permutation','rewrite replaces the deck with the committed plan','a rewrite plan/manifest mismatch restores the whole deck','editableMeta authorizes update_deck on the title','an unauthorized deck rename verify-fails and rolls back','a metaOnly lock freezes every page including its anchor','guard released'],
    errors,
  },null,2));
 }finally{if(page)await page.unrouteAll({behavior:'ignoreErrors'}).catch(()=>{});await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await done;}fs.rmSync(scratch,{recursive:true,force:true});}
});

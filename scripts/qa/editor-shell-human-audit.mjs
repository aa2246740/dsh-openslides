#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchPinnedChromium } from '../lib/pinned-playwright.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const port = Number(process.env.QA_PORT || 55484);
const base = `http://127.0.0.1:${port}`;
const out = path.resolve(process.env.QA_OUT || path.join(root, 'output/human-audit/shell-final'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'oss-shell-human-'));
const project = path.join(scratch, 'project');
fs.cpSync(path.join(root, 'fixtures/okp-yu7-ppt'), project, { recursive:true });
fs.mkdirSync(out, {recursive:true});
const server = spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'pipe'});
let logs=''; server.stdout.on('data', b=>logs+=b); server.stderr.on('data',b=>logs+=b);
let browser;
const report={steps:[],errors:[],exports:[]};
async function step(name,fn){await fn(); report.steps.push(name); console.log('PASS',name);}
try {
 for(let i=0;i<100;i++){try{if((await fetch(`${base}/api/health`)).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
 browser=await launchPinnedChromium({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 const page=await context.newPage(); page.on('pageerror', e=>report.errors.push(String(e)));
 await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#doc-title').textContent!=='未加载');
 await step('deduplicated insertion and Agent entry points',async()=>{
  assert.equal(await page.locator('#chat-attach,#btn-messages').count(),0);
  // Manual insert affordances are text / shape / image / table only: chart and
  // the bottom 更多 menu were retired by design (decks get charts from the agent).
  assert.equal(await page.locator('button[data-insert=chart]').count(),0);
  assert.equal(await page.locator('#insert-toolbar button[data-insert]').count(),4);
  assert.equal(await page.locator('#btn-more, #more-menu').count(),0);
 });
 await step('notes panel closes after saving the latest input and reopens intact',async()=>{
  await page.locator('#btn-notes-link').click();
  await page.locator('#notes-text').fill('SHELL_NOTES_CLOSE_PERSIST');
  const notesBox=await page.locator('#notes-panel').boundingBox();
  const toolbarBox=await page.locator('#insert-toolbar').boundingBox();
  assert.ok(toolbarBox.y+toolbarBox.height<=notesBox.y,'insertion toolbar must not cover the notes panel');
  await page.getByRole('button',{name:'收起演讲者备注',exact:true}).click();
  await page.locator('#notes-panel').waitFor({state:'hidden'});
  const saved=await (await page.request.get(`${base}/api/model`)).json();
  assert.equal(saved.model.notes,'SHELL_NOTES_CLOSE_PERSIST');
  await page.locator('#btn-notes-link').click();
  assert.equal(await page.locator('#notes-text').inputValue(),'SHELL_NOTES_CLOSE_PERSIST');
  await page.getByRole('button',{name:'收起演讲者备注',exact:true}).click();
  await page.locator('#notes-panel').waitFor({state:'hidden'});
 });
 let exportRequests=0;
 page.on('request',req=>{if(/\/api\/export(?:\/|\?|$)/.test(req.url()))exportRequests++;});
 await step('format selection is side-effect free and scope is explicit',async()=>{
  await page.locator('#btn-export').click();
  assert.match(await page.locator('#export-scope').innerText(),/全部 8 页/);
  await page.locator('#export-png').click();
  assert.equal(await page.locator('#export-font-label').isVisible(),false);
  assert.match(await page.locator('#export-scope').innerText(),/当前第 1 页/);
  await page.locator('#export-pptx').click();
  assert.equal(await page.locator('#export-font-label').isVisible(),true);
  await page.waitForTimeout(250);
  assert.equal(exportRequests,0);
 });
 for(const format of ['pptx','png']) await step(`download ${format} file after explicit action`,async()=>{
  await page.locator(`#export-${format}`).click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:90000}),page.locator('#export-download').click()]);
  const file=path.join(out,`human-export.${format}`); await download.saveAs(file);
  const bytes=fs.readFileSync(file);
  assert.ok(bytes.length>5000);
  assert.match(download.suggestedFilename(),new RegExp(`\\.${format}$`));
  if(format==='pptx')assert.equal(bytes.subarray(0,2).toString(),'PK');
  else assert.equal(bytes.subarray(1,4).toString(),'PNG');
  report.exports.push({format,file,bytes:bytes.length});
  await page.locator('#export-result').waitFor({state:'visible'});
 });
 await page.screenshot({path:path.join(out,'export.png')});
 await page.locator('#export-dialog button[value=cancel]').click();
 await step('version snapshot and preview round trip',async()=>{
  await page.locator('#btn-versions').click();
  const [snapshotResponse] = await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/versions'&&r.request().method()==='POST'),page.locator('#version-save').click()]);
  const snapshot = await snapshotResponse.json();
  const snapshotId = String(snapshot.version?.id || '');
  assert.ok(snapshotId, 'version snapshot response must identify the stored version');
  // Saving a snapshot now leaves the version list open, which would intercept the
  // canvas controls below; close it explicitly.
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{const menu=document.getElementById('version-menu');if(menu&&!menu.hidden)menu.hidden=true;});
  await page.locator('#insert-toolbar [data-insert=text]').click();
  await page.locator('#slide .el.text.selected').waitFor();
  await page.locator('#btn-versions').click();
  const stored = page.locator(`#versions-list [data-version-id="${snapshotId}"][data-control="chrome.history.versions.preview"]`);
  await stored.waitFor(); await stored.click();
  await page.locator('#history-bar').waitFor({state:'visible'});
  report.versionPreviewDom=await page.evaluate(()=>({
   appClass:document.querySelector('.app')?.className,
   insertDisplay:getComputedStyle(document.querySelector('#insert-toolbar')).display,
   historyDisplay:getComputedStyle(document.querySelector('#history-bar')).display,
   readonlyText:document.querySelector('#history-readonly')?.textContent,
   contentEditable:document.querySelectorAll('#slide [contenteditable=true]').length,
   editingClasses:[...document.querySelectorAll('#slide .is-editing,.is-editing-cell')].map(node=>node.className),
  }));
  report.versionPreviewDom.snapshotId=snapshotId;
  assert.equal(await page.locator('#insert-toolbar').isVisible(),false);
  assert.equal(await page.locator('#notes-text').isEditable(),false);
  assert.equal(await page.locator('#btn-export').isDisabled(),true);
  assert.equal(await page.locator('#btn-share').count(),0);
  assert.equal(await page.locator('#btn-zoom-in').isDisabled(),true);
  assert.equal(await page.locator('#rail .thumb').first().isEnabled(),true);
  let restoreAttempts=0;
  const failFirstRestore=async route=>{
   restoreAttempts+=1;
   await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'INJECTED_VERSION_RESTORE_FAILURE'})});
  };
  // Keep one predicate reference: unroute() matches by identity, so a fresh arrow
  // function would leave the injected failure installed.
  const restoreRoute=(url)=>url.pathname==='/api/versions/restore';
  await page.route(restoreRoute,failFirstRestore);
  await page.locator('#history-restore').click();
  await page.locator('#app-toast').waitFor({state:'visible'});
  assert.match(await page.locator('#app-toast').innerText(),/恢复版本失败.*INJECTED_VERSION_RESTORE_FAILURE/);
  assert.equal(await page.locator('#history-bar').isVisible(),true);
  assert.equal(await page.locator('.app').evaluate(node=>node.classList.contains('is-history')),true);
  assert.equal(await page.locator('#btn-export').isDisabled(),true);
  assert.equal(await page.locator('#history-restore').isEnabled(),true);
  assert.equal(restoreAttempts,1);
  await page.unroute(restoreRoute,failFirstRestore);
  const [restoreResponse]=await Promise.all([
   page.waitForResponse(r=>new URL(r.url()).pathname==='/api/versions/restore'&&r.request().method()==='POST'),
   page.locator('#history-restore').click(),
  ]);
  if(!restoreResponse.ok()){const body=await restoreResponse.text().catch(()=>"");throw new Error(`version restore retry failed: ${restoreResponse.status()} ${body.slice(0,400)}`);}
  await page.locator('#history-bar').waitFor({state:'hidden'});
  assert.equal(await page.locator('#insert-toolbar').isVisible(),true);
  report.versionRestore={failedAttemptRetainedPreview:true,retrySucceeded:true,snapshotId};
  await page.locator('#app-toast').waitFor({state:'hidden',timeout:7000});
  // The version list can survive the round trip above; close it so the following
  // responsive steps are not intercepted by its overlay.
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{const menu=document.getElementById('version-menu');if(menu&&!menu.hidden)menu.hidden=true;});
 });
 for(const width of [1440,1024,768,390])await step(`reachable controls and Agent panel at ${width}px`,async()=>{
  await page.setViewportSize({width,height:900});
  await page.locator('#btn-sparkles').scrollIntoViewIfNeeded(); await page.locator('#btn-sparkles').click();
  await page.locator('#work-brief').waitFor({state:'visible'});
  const box=await page.locator('#work-brief').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);
  await page.screenshot({path:path.join(out,`agent-${width}.png`)});
  await page.locator('#chat-close').click();
  // The bottom 更多 menu (with 公式) is retired; assert the surviving insert bar
  // is still exposed and the shell still has no horizontal overflow.
  await page.locator('#insert-toolbar').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#insert-toolbar').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,`editor-${width}.png`)});
 });
 assert.deepEqual(report.errors,[]);
 report.ok=true;
} catch(e){report.ok=false;report.failure=String(e.stack||e);console.error(e);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)); if(browser)await browser.close();server.kill('SIGTERM');fs.rmSync(scratch,{recursive:true,force:true});}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {launchPinnedChromium} from '../../../scripts/lib/pinned-playwright.mjs';
const ROOT=path.resolve(fileURLToPath(new URL('.',import.meta.url)),'../../..');

test('PPTX download belongs to its tab even when another project was opened later',async()=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-export-tabs-'));
 const projects=['Current deck','Other deck'].map((title,index)=>{
  const root=path.join(scratch,String(index));fs.mkdirSync(path.join(root,'pages'),{recursive:true});
  fs.writeFileSync(path.join(root,'deck.pptd'),JSON.stringify({version:'v2',title,size:[960,540],theme:{},pages:['pages/01.page']}));
  fs.writeFileSync(path.join(root,'pages/01.page'),JSON.stringify({pageType:'content',background:{type:'solid',color:'#FFFFFF'},elements:[{elementId:'title',elementType:'text',bounds:[100,100,650,80],content:{text:title,fontSize:36,color:'#123456',fontFamily:{latin:'Arial',ea:'楷体'}}}]}));
  return root;
 });
 const port=await new Promise(resolve=>{const p=net.createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n));});});
 const base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),OPEN_SLIDESTUDIO_PROJECT:projects[1],SLIDESTUDIO_RETENTION_DAYS:'0'},stdio:'ignore'});
 let browser;
 try{
  for(let n=0;n<80;n++){try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await launchPinnedChromium({headless:true});
  const first=await browser.newPage({locale:'zh-CN'}),second=await browser.newPage({locale:'zh-CN'});
  await first.goto(`${base}/index.html?project=${encodeURIComponent(projects[0])}`,{waitUntil:'networkidle'});
  assert.match(await first.locator('#slide').innerText(),/Current deck/);
  await first.getByRole('button',{name:'导出',exact:true}).click();
  await second.goto(`${base}/index.html?project=${encodeURIComponent(projects[1])}`,{waitUntil:'networkidle'});
  await first.evaluate(()=>{
    window.__exportRevoked=[];
    const orig=URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL=(value)=>{window.__exportRevoked.push(value);return orig(value);};
  });
  const requestPromise=first.waitForRequest(r=>new URL(r.url()).pathname==='/api/export');
  const responsePromise=first.waitForResponse(r=>new URL(r.url()).pathname==='/api/export');
  const downloadPromise=first.waitForEvent('download');
  await first.getByRole('button',{name:'下载',exact:true}).click();
  const request=await requestPromise,response=await responsePromise,download=await downloadPromise;
  assert.deepEqual(await first.evaluate(()=>window.__exportRevoked),[],'blob URL stays alive until the browser reads the download');
  assert.equal(request.postDataJSON().project,projects[0]);assert.equal(response.status(),200);
  const file=path.join(scratch,'current.pptx');await download.saveAs(file);
  assert.match(download.suggestedFilename(),/^Current_deck\.pptx$/);
  const xml=execFileSync('unzip',['-p',file,'ppt/slides/slide1.xml'],{encoding:'utf8'});
  assert.match(xml,/Current deck/);assert.doesNotMatch(xml,/Other deck/);
  const report=JSON.parse(Buffer.from(response.headers()['x-export-report'],'base64url'));
  assert.equal(report.slideCount,1);assert.equal(report.coverage,1);
  const fontNote=await first.locator('#export-result small').allInnerTexts();
  assert.ok(fontNote.some(t=>/^Office \/ WPS 自带，无需嵌入：.*Arial/.test(t)),`Office fonts are described as built in: ${fontNote}`);
  assert.ok(fontNote.every(t=>!/not in fonts\.css/.test(t)),'no raw exporter reason reaches the user');
 }finally{
  await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await done;}fs.rmSync(scratch,{recursive:true,force:true});
 }
});

test('PNG download is the page the tab is showing, not the default session page',async()=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-export-png-page-'));
 const root=path.join(scratch,'deck');fs.mkdirSync(path.join(root,'pages'),{recursive:true});
 const names=['01','02','03'];
 fs.writeFileSync(path.join(root,'deck.pptd'),JSON.stringify({version:'v2',title:'Three pages',size:[960,540],theme:{},pages:names.map(n=>`pages/${n}.page`)}));
 for(const n of names)fs.writeFileSync(path.join(root,`pages/${n}.page`),JSON.stringify({pageType:'content',background:{type:'solid',color:'#FFFFFF'},elements:[{elementId:'title',elementType:'text',bounds:[100,100,650,80],content:{text:`Page ${n}`,fontSize:36,color:'#123456',fontFamily:{latin:'Arial',ea:'楷体'}}}]}));
 const port=await new Promise(resolve=>{const p=net.createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n));});});
 const base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),OPEN_SLIDESTUDIO_PROJECT:root,SLIDESTUDIO_RETENTION_DAYS:'0'},stdio:'ignore'});
 let browser;
 try{
  for(let n=0;n<80;n++){try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await launchPinnedChromium({headless:true});
  const page=await browser.newPage({locale:'zh-CN'});
  await page.goto(`${base}/index.html?project=${encodeURIComponent(root)}`,{waitUntil:'networkidle'});
  const goTo=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/command'&&r.request().postDataJSON()?.cmd==='goToPage');
  await page.locator('#rail .thumb').nth(1).click();await goTo;
  assert.equal((await page.locator('#page-count').innerText()).replace(/\s/g,''),'2/3');
  await page.getByRole('button',{name:'导出',exact:true}).click();
  await page.locator('#export-png').click();
  assert.match(await page.locator('#export-scope').innerText(),/第 2 页/);
  const requestPromise=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/export');
  const downloadPromise=page.waitForEvent('download',{timeout:60000});
  await page.getByRole('button',{name:'下载',exact:true}).click();
  const request=await requestPromise,download=await downloadPromise;
  assert.ok(request.postDataJSON().tabId,'the export request names the tab whose page it should render');
  assert.match(download.suggestedFilename(),/-p2\.png$/,`PNG follows the tab's page: ${download.suggestedFilename()}`);
  const file=path.join(scratch,'page.png');await download.saveAs(file);
  assert.equal(fs.readFileSync(file).subarray(0,8).toString('hex'),'89504e470d0a1a0a','the download is a PNG');
 }finally{
  await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await done;}fs.rmSync(scratch,{recursive:true,force:true});
 }
});

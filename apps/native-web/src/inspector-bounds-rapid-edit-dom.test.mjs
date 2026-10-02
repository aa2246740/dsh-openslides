import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import {launchPinnedChromium} from '../../../scripts/lib/pinned-playwright.mjs';
const ROOT=path.resolve(fileURLToPath(new URL('.',import.meta.url)),'../../..');

// Every bounds field commits the whole [x,y,w,h] array. A second field edited before the inspector repainted
// from the first answer used to send the bounds painted earlier, silently undoing the first edit.
test('inspector X and width edited back to back both persist',async()=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'slides-bounds-rapid-'));
 const root=path.join(scratch,'deck');fs.mkdirSync(path.join(root,'pages'),{recursive:true});
 const pageFile=path.join(root,'pages/01.page');
 fs.writeFileSync(path.join(root,'deck.pptd'),JSON.stringify({version:'v2',title:'Bounds',size:[960,540],theme:{},pages:['pages/01.page']}));
 fs.writeFileSync(pageFile,JSON.stringify({pageType:'content',background:{type:'solid',color:'#FFFFFF'},elements:[{elementId:'box',elementType:'text',bounds:[100,100,300,80],content:{text:'Box',fontSize:36,color:'#123456',fontFamily:{latin:'Arial',ea:'楷体'}}}]}));
 const port=await new Promise(resolve=>{const p=net.createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n));});});
 const base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),OPEN_SLIDESTUDIO_PROJECT:root,SLIDESTUDIO_RETENTION_DAYS:'0'},stdio:'ignore'});
 let browser;
 try{
  for(let n=0;n<80;n++){try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await launchPinnedChromium({headless:true});
  const page=await browser.newPage({locale:'zh-CN',viewport:{width:1600,height:1000}});
  await page.goto(`${base}/index.html?project=${encodeURIComponent(root)}`,{waitUntil:'networkidle'});
  await page.locator('#slide .el[data-id="box"]').click();
  await page.waitForFunction(()=>!document.getElementById('property-panel')?.hidden);
  if(await page.locator('#property-panel.is-collapsed').count())await page.click('#property-toggle');
  await page.locator('[data-inspector-section="position-arrange"]').first().evaluate(n=>{if('open' in n)n.open=true;});
  const saved=()=>YAML.parse(fs.readFileSync(pageFile,'utf8')).elements[0].bounds;
  // Same tick: no repaint can happen between the two commits.
  await page.evaluate(()=>{
   const commit=(id,value)=>{const input=document.getElementById(id);input.value=String(value);input.dispatchEvent(new Event('change',{bubbles:true}));};
   commit('ctx-bounds-0',140);
   commit('ctx-bounds-2',420);
  });
  for(let n=0;n<60&&saved()[0]!==140;n++)await new Promise(r=>setTimeout(r,100));
  await new Promise(r=>setTimeout(r,600));
  assert.deepEqual(saved(),[140,100,420,80],'both edits land in the page file');
  assert.equal(await page.locator('#ctx-bounds-0').inputValue(),'140');
  assert.equal(await page.locator('#ctx-bounds-2').inputValue(),'420');
 }finally{
  await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await done;}fs.rmSync(scratch,{recursive:true,force:true});
 }
});

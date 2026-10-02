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

test('thin shape paint, hit area and annotation stay aligned across zoom, thumbnails and presentation',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'openslides-shape-alignment-'));
  const project=path.join(scratch,'project');fs.mkdirSync(path.join(project,'pages'),{recursive:true});
  fs.writeFileSync(path.join(project,'deck.pptd'),JSON.stringify({version:'v2',title:'Thin shape alignment',size:[960,540],theme:{},pages:['pages/01.page']}));
  const original=JSON.stringify({pageType:'cover',background:{type:'solid',color:'#F7F4EC'},elements:[
    {elementId:'thin-rule',elementType:'shape',shapeName:'rect',bounds:[120,178,64,6],fill:{type:'solid',color:'#14355C'}},
    {elementId:'normal-rect',elementType:'shape',shapeName:'rect',bounds:[380,160,120,72],fill:{type:'solid',color:'#14355C'}},
    {elementId:'rotated-rule',elementType:'shape',shapeName:'rect',bounds:[560,180,80,6],rotation:20,fill:{type:'solid',color:'#14355C'}},
    {elementId:'heading',elementType:'text',bounds:[120,260,720,70],content:{text:'装饰本体与选中范围一致',fontSize:36}},
  ]});
  const pageFile=path.join(project,'pages/01.page');fs.writeFileSync(pageFile,original);
  const port=await new Promise((resolve,reject)=>{const p=net.createServer();p.once('error',reject);p.listen(0,'127.0.0.1',()=>{const port=p.address().port;p.close(()=>resolve(port));});});
  const base=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),OPEN_SLIDESTUDIO_PROJECT:project,SLIDESTUDIO_RETENTION_DAYS:'0'},stdio:'ignore'});
  const out=process.env.SLIDESTUDIO_QA_OUTPUT_DIR || path.join(ROOT,'output/shape-alignment-acceptance-2026-09-20');fs.mkdirSync(out,{recursive:true});
  let browser;
  const checks=[];
  try {
    for(let i=0;i<80;i++) {try {if((await fetch(`${base}/api/health`)).ok) break;}catch{if(i===79) throw new Error('Test server failed');}await new Promise(r=>setTimeout(r,100));}
    browser=await launchPinnedChromium({headless:true});
    const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:900}});
    await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=0`,{waitUntil:'domcontentloaded'});
    const check=async(selector,label)=>{
      await page.locator(`${selector} .el.shape > svg.shape-paint`).first().waitFor({state:'attached'});
      const deltas=await page.locator(`${selector} .el.shape`).evaluateAll(nodes=>nodes.map(n=>{
        const outer=n.getBoundingClientRect(),svg=n.querySelector('svg').getBoundingClientRect(),paint=n.querySelector('path').getBoundingClientRect();
        return {id:n.dataset.id,svg:[svg.x-outer.x,svg.y-outer.y,svg.width-outer.width,svg.height-outer.height],paint:[paint.x-outer.x,paint.y-outer.y,paint.width-outer.width,paint.height-outer.height]};
      }));
      for(const item of deltas) for(const value of [...item.svg,...item.paint]) assert.ok(Math.abs(value)<.12,`${label}: ${JSON.stringify(item)}`);
      checks.push({label,deltas});
    };
    for(const width of [1440,877,1920]) {
      await page.setViewportSize({width,height:900});
      await check('#slide',`canvas-${width}`);await check('#rail',`thumbnail-${width}`);
      await page.locator('#btn-comments').click();
      await page.locator('#slide .el[data-id="thin-rule"]').click();
      const mark=page.locator('[data-comment-draft-target="thin-rule"]');await mark.waitFor();
      // Measure outline and paint together once the overlay has held still for
      // two frames: a resize rebuilds the overlay briefly, and two separate
      // async reads could straddle that rebuild.
      const [a,b]=await page.evaluate(async()=>{
        const read=()=>[document.querySelector('[data-comment-draft-target="thin-rule"]'),document.querySelector('#slide .el[data-id="thin-rule"] path')].map(n=>{const r=n?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;});
        const frame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
        let last='',steady=0,boxes=read();
        for(let i=0;i<60&&steady<2;i++){await frame();boxes=read();const key=JSON.stringify(boxes);steady=key===last&&boxes.every(Boolean)?steady+1:0;last=key;}
        return boxes;
      });
      for(const k of ['x','y','width','height']) assert.ok(Math.abs(a[k]-b[k])<.12,`Annotation ${width} ${k}: ${a[k]} != ${b[k]}`);
      await page.screenshot({path:path.join(out,`thin-selected-${width}.png`)});
      await page.keyboard.press('Escape');
    }
    await page.locator('#btn-zoom-in').click();
    await check('#slide','canvas-zoom-in');
    await page.locator('#btn-play').click();
    await page.locator('.present-slide').waitFor();
    await check('.present-slide','presentation');
    const presentation=await page.locator('.present-slide').boundingBox();
    assert.ok(presentation.x>=0&&presentation.y>=0&&presentation.x+presentation.width<=1920&&presentation.y+presentation.height<=900,'Playback keeps the complete scaled slide inside the viewport');
    assert.ok(Math.abs(presentation.x+presentation.width/2-960)<.12&&Math.abs(presentation.y+presentation.height/2-450)<.12,'Playback scales around the viewport center');
    await page.screenshot({path:path.join(out,'presentation.png')});
    await page.keyboard.press('Escape');
    await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&render=1`,{waitUntil:'domcontentloaded'});
    await check('#slide','render-page');
    assert.equal(fs.readFileSync(pageFile,'utf8'),original,'Rendering never rewrites PPTD geometry');
    fs.writeFileSync(path.join(out,'geometry-results.json'),JSON.stringify({checks,documentUnchanged:true},null,2));
  } finally {
    await browser?.close();
    if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await done;}
    fs.rmSync(scratch,{recursive:true,force:true});
  }
});

import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {launchPinnedChromium} from '../lib/pinned-playwright.mjs';
const base=process.env.BASE || 'http://127.0.0.1:55201';
const project=process.env.PROJECT;
if(!project) throw new Error('PROJECT must name an idle discussion project');
const out=path.resolve(process.env.OUT || 'output/qa-continuous-collaboration');
await fs.mkdir(out,{recursive:true});
const browser=await launchPinnedChromium({headless:true});
const results=[];
try {
 for(const width of [1440,1024,877,390]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('editor-generation-status')?.textContent==='继续聊聊');
  const metrics=await page.evaluate(()=>{const chat=document.getElementById('work-chat').getBoundingClientRect(),app=document.querySelector('.app').getBoundingClientRect(),composer=document.getElementById('work-form').getBoundingClientRect();return{width:innerWidth,documentWidth:document.documentElement.scrollWidth,chat:{x:chat.x,right:chat.right,width:chat.width},appX:app.x,composerBottom:composer.bottom};});
  assert.ok(metrics.documentWidth<=width+1,JSON.stringify(metrics));
  assert.ok(metrics.composerBottom<=901,JSON.stringify(metrics));
  if(width>720) assert.ok(metrics.appX>=metrics.chat.right-1,JSON.stringify(metrics));
  await page.screenshot({path:`${out}/editor-${width}.png`});
  if(width===390) {
   await page.locator('#chat-close').click();
   assert.equal(await page.locator('#work-chat').isVisible(),false);
   assert.equal(await page.getByRole('button',{name:'打开 AI 工作区',exact:true}).isVisible(),true);
   await page.screenshot({path:`${out}/editor-${width}-canvas.png`});
  }
  results.push(metrics);await page.close();
 }
 await fs.writeFile(`${out}/responsive-verification.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
}finally{await browser.close();}

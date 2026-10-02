import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launchPinnedChromium} from '../lib/pinned-playwright.mjs';
import {marquee} from './gestures.mjs';
const base=process.env.BASE || 'http://127.0.0.1:55201';
const project=process.env.PROJECT;
if (!project) throw new Error('PROJECT must name an idle cover project with cover-title, cover-sub and cover-meta');
const out=path.resolve(process.env.OUT || 'output/annotation-selection-acceptance-2026-09-20');
await fs.mkdir(out,{recursive:true});
const browser=await launchPinnedChromium({headless:true});
const results=[];
try {
  for (const [width,height] of [[1920,1080],[1440,900],[1024,768],[877,900],[720,640],[375,720],[877,560]]) {
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=1`,{waitUntil:'domcontentloaded'});
    await page.locator('#slide .el[data-id="cover-title"]').waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('#assistant-model option').length>1);
    const assertBounds=async(selector,container='body')=>{
      const value=await page.locator(selector).evaluate((node,container)=>{
        const r=node.getBoundingClientRect(),p=document.querySelector(container).getBoundingClientRect();
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {selector:node.id||node.className,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,inside:r.x>=p.x-1&&r.y>=p.y-1&&r.right<=p.right+1&&r.bottom<=p.bottom+1,reachable:node===hit||node.contains(hit)};
      },container);
      assert.ok(value.inside && value.reachable,`${width}x${height}: ${JSON.stringify(value)}`);
      return value;
    };
    const composer=await assertBounds('#work-form');
    for(const selector of ['#work-brief','#assistant-model','.composer-send','#composer-plus']) await assertBounds(selector,'#work-form');
    assert.equal(await page.locator('#work-target').isVisible(),false,'Idle hint does not duplicate the prompt');
    await page.screenshot({path:path.join(out,`chat-${width}x${height}.png`)});
    if(width<=720) await page.locator('#chat-close').click();
    const editorControls=['#btn-versions','#btn-comments','#btn-sparkles','#btn-export','#btn-play','#btn-fs','#btn-rail-view','#btn-rail','#btn-undo','#btn-redo','#btn-zoom-out','#zoom-label','#btn-zoom-in'];
    for(const selector of editorControls) await assertBounds(selector,'.app');
    for(const type of ['text','shape','image','table']) await assertBounds(`[data-insert="${type}"]`,'.app');
    const version=await page.locator('#btn-versions').evaluate(n=>({scroll:n.scrollHeight,client:n.clientHeight,whiteSpace:getComputedStyle(n).whiteSpace}));
    assert.equal(version.whiteSpace,'nowrap');assert.ok(version.scroll<=version.client);
    const rail=await page.locator('#rail .thumb-frame').first().boundingBox();
    assert.ok(rail.width>=64,'Stacked thumbnail uses available rail width');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('#btn-comments').click();
    // gestures.marquee takes slide-local units; convert the client rects once.
    const geometry=await page.locator('#slide').evaluate(n=>{
      const m=/scale\(([^)]+)\)/.exec(n.style.transform||'');
      const scale=m?Number(m[1]):1;
      const slide=n.getBoundingClientRect();
      const local=r=>({x:(r.left-slide.left)/scale,y:(r.top-slide.top)/scale,right:(r.right-slide.left)/scale,bottom:(r.bottom-slide.top)/scale});
      const title=local(n.querySelector('[data-id="cover-title"]').getBoundingClientRect());
      const rule=local(n.querySelector('[data-id="cover-rule"]').getBoundingClientRect());
      const meta=local(n.querySelector('[data-id="cover-meta"]').getBoundingClientRect());
      return {from:{x:title.x-4/scale,y:rule.y-4/scale},to:{x:title.x+(title.right-title.x)*.36,y:meta.bottom+4/scale}};
    });
    await marquee(page,geometry.from.x,geometry.from.y,geometry.to.x,geometry.to.y);
    const targets=()=>page.locator('#comment-panel').evaluate(n=>JSON.parse(n.dataset.targetIds).sort());
    assert.deepEqual(await targets(),['cover-meta','cover-rule','cover-sub','cover-title']);
    assert.equal(await page.locator('.comment-draft-target').count(),4);
    assert.equal(await page.locator('.comment-draft-region').count(),0);
    await assertBounds('#comment-panel');
    await page.locator('#comment-draft').fill('仅用于确认框选范围，不提交');
    await page.locator('#comment-targets [data-target-id="cover-rule"] button').click();
    assert.deepEqual(await targets(),['cover-meta','cover-sub','cover-title']);
    assert.equal(await page.locator('#comment-draft').inputValue(),'仅用于确认框选范围，不提交');
    await assertBounds('#comment-add','#comment-panel');
    const overlap=await page.locator('#comment-panel').evaluate(panel=>{
      const r=panel.getBoundingClientRect(),canvas=document.getElementById('viewport').getBoundingClientRect();
      const area=[...document.querySelectorAll('.comment-draft-target')].reduce((a,n)=>{
        const t=n.getBoundingClientRect();return a+Math.max(0,Math.min(r.right,t.right)-Math.max(r.left,t.left))*Math.max(0,Math.min(r.bottom,t.bottom)-Math.max(r.top,t.top));
      },0);
      return {area,avoidsChat:canvas.width<r.width+24||r.left>=canvas.left};
    });
    assert.ok(overlap.avoidsChat,'Popover respects chat/canvas separation when space permits');
    if(height>=720) assert.equal(overlap.area,0,'Popover leaves chosen objects visible when there is room');
    await page.screenshot({path:path.join(out,`selection-${width}x${height}.png`)});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#comment-panel').isVisible(),false);
    assert.equal(errors.length,0,errors.join('\n'));
    results.push({width,height,composerHeight:composer.height,thumbnailWidth:rail.width,version,targets:['cover-meta','cover-sub','cover-title'],consoleErrors:errors});
    await page.close();
  }
  const resizing=await browser.newPage({viewport:{width:1440,height:900}});
  await resizing.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=1`,{waitUntil:'domcontentloaded'});
  await resizing.locator('#rail .thumb-frame').first().waitFor();
  const transitions=[];
  for (const width of [1024,877,375,1440]) {
    await resizing.setViewportSize({width,height:900});
    if(width<=720) await resizing.locator('#chat-close').click();
    else if(!await resizing.locator('#work-chat').isVisible()) await resizing.locator('#btn-sparkles').click();
    await resizing.waitForFunction(()=>{
      const rail=document.getElementById('rail'),frame=rail.querySelector('.thumb-frame'),s=getComputedStyle(rail);
      const wanted=rail.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)-parseFloat(s.getPropertyValue('--thumbnail-gutter')||'32');
      return Math.abs(frame.getBoundingClientRect().width-wanted)<2;
    },null,{timeout:3000});
    transitions.push({width,thumbnail:(await resizing.locator('#rail .thumb-frame').first().boundingBox()).width});
  }
  await resizing.locator('#chat-close').click();
  await resizing.locator('#btn-sparkles').click();
  assert.ok(await resizing.locator('#work-brief').isVisible());
  await fs.writeFile(path.join(out,'resize-results.json'),JSON.stringify(transitions,null,2));
  await resizing.close();
  await fs.writeFile(path.join(out,'responsive-results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:results.length,results}));
} finally {await browser.close();}

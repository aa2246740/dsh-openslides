#!/usr/bin/env node
// Reading/terminal regression using the real session captured by native-stream-live.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launchPinnedChromium } from '../lib/pinned-playwright.mjs';
const out=path.resolve('output/native-stream-recovery-2026-09-16');
const session=JSON.parse(await fs.readFile(path.join(out,'live-session.json'),'utf8'));
const browser=await launchPinnedChromium({headless:true});
const report={sessionId:session.sessionId,cases:[]};
try {
  for(const width of [1100,1440]) {
    const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(session.url,{waitUntil:'domcontentloaded'});
    const toggle=page.locator('.reader-process-toggle');await toggle.waitFor({state:'visible'});
    if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
    const card=page.locator('details.reason-card').first();
    await card.locator('summary').click();
    await page.waitForFunction(()=>document.querySelector('details.reason-card')?.open);
    const result=await page.evaluate(()=>{
      const root=document.querySelector('details.reason-card');
      const nodes=[...document.querySelectorAll('#editor-generation-event-list > [data-process-key]')];
      return {cardOpen:root.open,textLength:root.querySelector('[data-process-detail]').textContent.length,
        border:getComputedStyle(root).borderTopWidth,background:getComputedStyle(root).backgroundColor,
        radius:getComputedStyle(root).borderTopLeftRadius,
        uniqueKeys:new Set(nodes.map(n=>n.dataset.processKey)).size===nodes.length,
        horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth,
        fakeReveal:!!root.querySelector('[data-reasoning-moving="true"]'),
        sendButtons:document.querySelectorAll('#work-form button[type="submit"]').length};
    });
    assert.equal(result.cardOpen,true);assert.ok(result.textLength>0);
    assert.equal(result.border,'1px');assert.equal(result.radius,'12px');
    assert.equal(result.uniqueKeys,true);assert.equal(result.horizontalOverflow,false);
    assert.equal(result.fakeReveal,false);assert.equal(result.sendButtons,1);assert.deepEqual(errors,[]);
    report.cases.push({width,...result,pageErrors:errors});
    await page.screenshot({path:path.join(out,`reading-${width}.png`)});
    await page.close();
  }
  report.accepted=true;
} catch(e){ report.accepted=false;report.failure=e.message;process.exitCode=1; }
finally {await browser.close();await fs.writeFile(path.join(out,'reading-evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const ROOT=path.resolve(fileURLToPath(new URL('.',import.meta.url)),'../../..');

// HTTP-level guards on the editor sidecar: loopback Host allowlist, same-origin
// enforcement for mutations, and JSON content-type only when a body is present.
test('request guards reject foreign hosts, cross-site mutations and non-JSON bodies',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'openslides-guards-'));
  const project=path.join(scratch,'project');
  fs.mkdirSync(path.join(project,'pages'),{recursive:true});
  fs.writeFileSync(path.join(project,'deck.pptd'),JSON.stringify({version:'v2',title:'Guards',size:[960,540],theme:{},pages:['pages/01.page']}));
  fs.writeFileSync(path.join(project,'pages/01.page'),JSON.stringify({pageType:'content',background:{type:'solid',color:'#FFF'},elements:[]}));
  const port=await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const n=probe.address().port;probe.close(()=>resolve(n));});});
  const base=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['apps/native-web/src/server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),OPEN_SLIDESTUDIO_PROJECT:project,SLIDESTUDIO_RETENTION_DAYS:'0'},stdio:'ignore'});
  try {
    for(let i=0;i<80;i++) {
      try {if((await fetch(`${base}/api/health`)).ok) break;} catch {if(i===79) throw new Error('server did not start');}
      await new Promise(r=>setTimeout(r,100));
    }
    const hit=(headers={},opts={})=>fetch(`${base}/api/command`,{method:'POST',...opts,headers:{'content-type':'application/json',...headers}});

    // fetch() cannot forge Host (forbidden header) — use a raw socket.
    const rawStatus=(hostHeader)=>new Promise((resolve,reject)=>{
      const socket=net.connect(port,'127.0.0.1',()=>{
        socket.write(`GET /api/health HTTP/1.1\r\nHost: ${hostHeader}\r\nConnection: close\r\n\r\n`);
        let data='';
        socket.on('data',c=>data+=c);
        socket.on('end',()=>resolve(Number(data.split(' ')[1])));
        socket.on('error',reject);
      });
    });
    assert.equal(await rawStatus('evil.example.com'),421,'foreign Host must be refused');
    assert.equal(await rawStatus(`127.0.0.1:${port}`),200,'loopback Host passes');

    const crossSite=await hit({origin:'https://evil.example.com'},{body:JSON.stringify({cmd:'select'})});
    assert.equal(crossSite.status,403,'cross-site Origin mutation must be refused');

    const fetchSite=await hit({'sec-fetch-site':'cross-site'},{body:JSON.stringify({cmd:'select'})});
    assert.equal(fetchSite.status,403,'cross-site fetch metadata must be refused');

    const plain=await fetch(`${base}/api/command`,{method:'POST',body:'cmd=select',headers:{'content-type':'text/plain'}});
    assert.equal(plain.status,415,'a body without JSON content-type must be refused');

    const bodyless=await fetch(`${base}/api/command`,{method:'POST'});
    assert.notEqual(bodyless.status,415,'a bodyless POST is not a content-type violation');

    const legit=await hit({},{body:JSON.stringify({cmd:'select'})});
    assert.equal(legit.status,200,'same-origin JSON mutation still works');
  } finally {
    server.kill('SIGTERM');
    fs.rmSync(scratch,{recursive:true,force:true});
  }
});

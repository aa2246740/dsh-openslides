import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assistantVersionArtifacts} from './assistant-artifacts.mjs';
import {conversationProcessRows} from '../public/conversation-scroll.js';
import {conversationMessageKey} from '../public/assistant-conversation.js';

test('before-version uses durable request identity, never model text or latest-version guessing',()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 const messages=[{id:'one',mode:'edit',clientRequestId:id},{id:'two',mode:'edit',clientRequestId:'other'}];
 const versions=[{id:'v18',assistantRequestId:id,assistantOutcome:'applied'},{id:'v19',assistantRequestId:'not-this-request'}];
 assert.deepEqual(assistantVersionArtifacts('/nonexistent',versions,{messages}),[{messageId:'one',snapshotId:'v18',snapshotLabel:'V18'}]);
 assert.equal(conversationMessageKey({id:'local:'+id,clientRequestId:id}),conversationMessageKey(messages[0]),'accepted echo keeps the same rendered identity');
 assert.deepEqual(assistantVersionArtifacts('/nonexistent',[{id:'v18',assistantRequestId:id}],{messages}),[{messageId:'one',snapshotId:'v18',snapshotLabel:'V18'}],'before-version is available during a turn; it does not claim success');
 assert.deepEqual(assistantVersionArtifacts('/nonexistent',[...versions,{id:'v20',assistantRequestId:id,assistantOutcome:'applied'}],{messages}),[],'ambiguous artifacts do not pick an arbitrary version');
});

test('old before-version is recovered only from exact conversation prefix plus native authorization',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'slides-artifact-'));
 const authorizationId='agent-chat-12345678-1234-1234-1234-123456789abc';
 const version={id:'v18',note:`agent-chat:${authorizationId}:deck:1,2`,createdAt:'2026-09-20T08:39:35.624Z'};
 const prior={id:'before',mode:'discuss',text:'same words'};
 const message={id:'edit',mode:'edit',at:'2026-09-20T08:39:35.800Z',text:'same words'};
 try {
  fs.mkdirSync(path.join(root,'.versions/v18/_agent'),{recursive:true});fs.mkdirSync(path.join(root,'_agent'));
  fs.writeFileSync(path.join(root,'.versions/v18/_agent/assistant-conversation.v1.json'),JSON.stringify({messages:[prior]}));
  fs.writeFileSync(path.join(root,'_agent/run-ledger.v1.json'),JSON.stringify({facts:[{type:'page.edit-authorized',authorizationId,at:'2026-09-20T08:39:35.697Z'}]}));
  assert.equal(assistantVersionArtifacts(root,[version],{messages:[prior,message]})[0]?.snapshotId,'v18');
  assert.deepEqual(assistantVersionArtifacts(root,[version],{messages:[{...prior,id:'another'},message]}),[],'a different history cannot borrow the artifact');
  assert.deepEqual(assistantVersionArtifacts(root,[version,{id:'v19',createdAt:'2026-09-20T08:39:35.700Z'}],{messages:[prior,message]}),[],'an intervening snapshot invalidates legacy inference');
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('new turn opens its own process and leaves completed history alone',()=>{
 const rows=[{key:'u1',kind:'user'},{key:'a1',kind:'message',turn:1,inProcess:true},{key:'t1',kind:'tool',turn:1},{key:'f1',kind:'message',turn:1},{key:'u2',kind:'user'},{key:'t2',kind:'tool',turn:2},{key:'f2',kind:'message',turn:2}];
 let projected=conversationProcessRows(rows,true);
 assert.deepEqual(projected.filter(r=>r.kind==='process-head').map(r=>[r.groupKey,r.open]),[['u1',false],['u2',true]]);
 assert.equal(projected.find(r=>r.key==='f1').processHidden,false);
 projected=conversationProcessRows(rows,false,new Map([['u1',true]]));
 assert.deepEqual(projected.filter(r=>r.kind==='process-head').map(r=>[r.groupKey,r.open]),[['u1',true],['u2',false]]);
});

test('a live turn folds everything before the latest reasoning into one counted row',()=>{
 const rows=[{key:'u1',kind:'user'},
  {key:'r1',kind:'reasoning',turn:1},{key:'t1',kind:'tool',turn:1},{key:'m1',kind:'message',turn:1,inProcess:true},
  {key:'r2',kind:'reasoning',turn:1},{key:'t2',kind:'tool',turn:1},{key:'t3',kind:'tool',turn:1},
  {key:'r3',kind:'reasoning',turn:1},{key:'t4',kind:'tool',turn:1}];
 let projected=conversationProcessRows(rows,true);
 const head=projected.find(r=>r.kind==='process-head');
 assert.equal(head.open,false,'earlier steps fold while the turn is live');
 assert.equal(head.summary,'思考×2 · 输出×1 · 工具×3');
 assert.deepEqual(projected.filter(r=>r.kind!=='process-head'&&!r.processHidden).map(r=>r.key),['u1','r3','t4'],'only the current step stays open');
 assert.ok(projected.indexOf(head)<projected.findIndex(r=>r.key==='r1'),'the fold row sits where the folded steps were');
 // Before a second reasoning step there is nothing to fold yet.
 projected=conversationProcessRows(rows.slice(0,4),true);
 assert.equal(projected.find(r=>r.kind==='process-head').open,true);
 assert.equal(projected.filter(r=>r.processHidden).length,0);
 // A manual choice wins over the live fold.
 projected=conversationProcessRows(rows,true,new Map([['u1',true]]));
 assert.equal(projected.filter(r=>r.processHidden).length,0);
 // After the turn, the whole process folds behind the same counted row; the answer stays.
 projected=conversationProcessRows([...rows,{key:'f1',kind:'message',turn:1}],false);
 const done=projected.find(r=>r.kind==='process-head');
 assert.equal(done.open,false);
 assert.equal(done.summary,'思考×3 · 输出×1 · 工具×4');
 assert.deepEqual(projected.filter(r=>r.kind!=='process-head'&&!r.processHidden).map(r=>r.key),['u1','f1']);
});

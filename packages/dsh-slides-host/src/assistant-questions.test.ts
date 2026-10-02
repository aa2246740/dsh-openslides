import { it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { UserQuestionService } from '@deepseek-ai/dsh-user-questions';
import { AssistantQuestions, validateAnswer } from './assistant-questions.js';
const questions = [{ id: 'theme', question: '选个背景', options: [{ label: '深蓝' }, { label: '深紫' }] }];

it('answers the real DSH waterfall and persists exactly one answer across duplicate HTTP acknowledgements', async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slides-question-'));
 const bridge = new AssistantQuestions(id => id === 'test' ? root : undefined);
 const ctx = new Context();
 const service = new UserQuestionService(ctx);
 ctx.on('user-questions/request', request => bridge.ask('test', request));
 try {
  const completion = service.ask({ questions });
  const pending = bridge.list('test')[0]!;
  assert.equal(pending.status, 'pending');
  const answer = { answers: [{ id: 'theme', selected: ['深蓝'] }] };
  bridge.settle('test', pending.id, { action: 'answer', answer });
  assert.deepEqual(await completion, answer);
  bridge.settle('test', pending.id, { action: 'answer', answer });
  assert.equal(bridge.list('test').length, 1);
  assert.equal(new AssistantQuestions(() => root).list('test')[0]!.status, 'answered');
  assert.throws(() => bridge.settle('test', pending.id, { action: 'answer', answer: { answers: [{ id: 'theme', selected: ['深紫'] }] } }));
 } finally { bridge.dispose(); fs.rmSync(root, {recursive:true,force:true}); }
});
it('keeps an invalid answer pending and accepts custom or multi-select answers using the native shape', async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slides-question-'));
 const bridge = new AssistantQuestions(() => root);
 try {
  const completion = bridge.ask('test', { questions });
  const pending = bridge.list('test')[0]!;
  for (const answer of [{answers:[]}, {answers:[{id:'theme',selected:['unknown']}]}, {answers:[{id:'theme',selected:['深蓝','深紫']}]}, {answers:[{id:'theme',selected:['深蓝'],custom:'conflicting'}]}]) assert.throws(() => bridge.settle('test', pending.id, {action:'answer',answer}));
  assert.equal(bridge.list('test')[0]!.status,'pending');
  const answer={answers:[{id:'theme',selected:[],custom:'墨绿'}]};
  bridge.settle('test',pending.id,{action:'answer',answer});assert.deepEqual(await completion,answer);
  assert.deepEqual(validateAnswer([{...questions[0]!,multiSelect:true}],{answers:[{id:'theme',selected:['深蓝','深紫'],custom:'补充'}]}).answers[0]!.selected,['深蓝','深紫']);
 } finally {bridge.dispose();fs.rmSync(root,{recursive:true,force:true});}
});
it('stop and cancel reject the waiting native tool and never fabricate an answer', async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'slides-question-'));const bridge=new AssistantQuestions(()=>root);
 try {
  const abort=new AbortController();const pending=bridge.ask('test',{questions,signal:abort.signal});
  const rejected=assert.rejects(pending,{code:'ASK_ABORTED'});abort.abort();await rejected;
  assert.equal(bridge.list('test')[0]!.status,'cancelled');
  const next=bridge.ask('test',{questions});const cancelled=assert.rejects(next,{code:'ASK_CANCELLED'});
  bridge.settle('test',bridge.list('test').at(-1)!.id,{action:'cancel'});await cancelled;
 } finally {bridge.dispose();fs.rmSync(root,{recursive:true,force:true});}
});
it('reopened UI sees pending requests, but a restarted Host cannot answer an orphaned tool', async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'slides-question-'));const bridge=new AssistantQuestions(()=>root);
 try {
  const pending=bridge.ask('test',{questions});const rejected=assert.rejects(pending,{code:'ASK_ABORTED'});
  assert.equal(bridge.list('test')[0]!.status,'pending');
  const restarted=new AssistantQuestions(()=>root);assert.equal(restarted.list('test')[0]!.status,'interrupted');
  assert.throws(()=>restarted.settle('test',bridge.list('test')[0]!.id,{action:'answer',answer:{answers:[{id:'theme',selected:['深蓝']}]}}));
  bridge.dispose();await rejected;
 } finally {bridge.dispose();fs.rmSync(root,{recursive:true,force:true});}
});

it('failed answer persistence leaves the native tool pending and allows a real retry', async t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'slides-question-'));const bridge=new AssistantQuestions(()=>root);
 try {
  const completion=bridge.ask('test',{questions});const id=bridge.list('test')[0]!.id;
  const answer={answers:[{id:'theme',selected:['深紫']}]};
  const rename=t.mock.method(fs,'renameSync',()=>{throw new Error('disk unavailable');});
  assert.throws(()=>bridge.settle('test',id,{action:'answer',answer}),/disk unavailable/);
  rename.mock.restore();
  assert.equal(bridge.list('test')[0]!.status,'pending');
  bridge.settle('test',id,{action:'answer',answer});assert.deepEqual(await completion,answer);
  assert.ok(bridge.list('test')[0]!.answeredAt);
 } finally {t.mock.restoreAll();bridge.dispose();fs.rmSync(root,{recursive:true,force:true});}
});

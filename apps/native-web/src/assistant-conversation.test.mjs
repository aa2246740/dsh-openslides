import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationEvents, settledAssistantActivity } from '../public/assistant-conversation.js';
import { projectGenerationProcess, humanizeGenerationFault } from '../public/generation-process.js';


test('reload joins durable user turns and model responses in chronological order without duplicating the brief', () => {
  const activity = {brief:'原始需求',events:[{id:'a1',kind:'message',at:'2026-09-20T00:00:01Z',detail:'回复1'},{id:'a2',kind:'message',at:'2026-09-20T00:00:03Z',detail:'回复2'}],conversation:{messages:[{id:'u0',text:'原始需求',at:'2026-09-20T00:00:00Z'},{id:'u1',text:'接着聊',at:'2026-09-20T00:00:02Z'}]}};
  const rows = projectGenerationProcess(conversationEvents(JSON.parse(JSON.stringify(activity))));
  assert.deepEqual(rows.map(row=>[row.kind,row.detail]),[['message','回复1'],['user','接着聊'],['message','回复2']]);
});


test('provider restrictions offer recovery without claiming a document change',()=>{
  assert.match(humanizeGenerationFault({error:{code:'provider-auth',detail:"OpenCode's free tier can only be used from within OpenCode"}}),/官方客户端.*切换.*当前对话会保留/);
  assert.match(humanizeGenerationFault({error:{detail:'Requested model DeepSeek-V4-Flash not supported'}}),/换一个模型/);
});

test('accepted submissions leave the draft and attach their durable result to the user message', async () => {
  const { commentIsDraft } = await import('../public/assistant-conversation.js');
  const comment = { id:'c1', pagePath:'pages/a.page', revision:2, aiStatus:'running', aiSubmissionId:'r1' };
  const receipt = { id:'r1', status:'preparing', items:[{commentId:'c1',pagePath:'pages/a.page',commentRevision:1}] };
  const activity = { reviewSubmissions:[receipt], conversation:{ messages:[] } };
  assert.equal(commentIsDraft(comment, null),true);
  assert.equal(commentIsDraft(comment,activity),true,'preparing is not sent');
  activity.conversation.messages.push({id:'m1',text:'修改标题',reviewSubmissionId:'r1'});
  assert.equal(commentIsDraft(comment,activity),false);
  assert.equal(commentIsDraft({...comment,aiSubmissionId:undefined,revision:1},activity),false,'stale cache must not resurrect a sent draft');
  let row=projectGenerationProcess(conversationEvents(activity))[0];
  assert.equal(row.reviewSubmission.status,'running');
  receipt.status='failed'; receipt.error='范围校验失败';
  row=projectGenerationProcess(conversationEvents(JSON.parse(JSON.stringify(activity))))[0];
  assert.equal(row.reviewSubmission.retryable,true);
  assert.equal(row.reviewSubmission.error,'范围校验失败');
  assert.equal(commentIsDraft({...comment,aiStatus:'failed',revision:3},activity),false);
  assert.equal(commentIsDraft({...comment,aiSubmissionId:undefined,aiStatus:'idle',revision:4},activity),true,'explicit editing creates a new draft');
  activity.reviewSubmissions.push({...receipt,id:'r2',status:'applied'});
  activity.conversation.messages.push({id:'m2',text:'修改标题',reviewSubmissionId:'r2'});
  const rows=projectGenerationProcess(conversationEvents(activity));
  assert.equal(rows[0].reviewSubmission.status,'failed','retry must not rewrite the first outcome');
  assert.equal(rows[0].reviewSubmission.retryable,false);
  assert.equal(rows[1].reviewSubmission.status,'applied');
});

test('an idle conversational answer does not inherit a stale generating lock',()=>{
 const a={phase:'generating',conversation:{mode:'generate',messages:[{at:'2026-09-20T10:00:00Z'}]},events:[
  {kind:'message',at:'2026-09-20T10:00:01Z',detail:'要几页？'},
  {kind:'turn',name:'turn',status:'complete',at:'2026-09-20T10:00:02Z'},
 ]};
 assert.equal(settledAssistantActivity(a,'idle').phase,'discussion');
 assert.equal(settledAssistantActivity(a,'busy').phase,'generating');
 const withTools = {...a,events:[...a.events,{kind:'tool',name:'write_page',at:'2026-09-20T10:00:01Z'}]};
 assert.equal(settledAssistantActivity(withTools,'idle').phase,'paused');
 assert.equal(settledAssistantActivity({...withTools,phase:'complete'},'idle').phase,'complete');
 assert.equal(settledAssistantActivity({...withTools,phase:'failed'},'idle').phase,'failed');
 assert.equal(settledAssistantActivity({...withTools,events:[]},'idle').phase,'generating','no premature finish before the turn arrives');
});

test('tool narration folds but completed answers from earlier turns stay readable', () => {
 const rows = projectGenerationProcess([
  {id:'n1',kind:'message',detail:'先读取页面'},
  {id:'t1',kind:'tool',name:'read_page',status:'complete'},
  {id:'a1',kind:'message',detail:'第一轮最终回复'},
  {id:'u2',kind:'user',detail:'继续修改'},
  {id:'n2',kind:'message',detail:'正在修改'},
  {id:'t2',kind:'tool',name:'edit_elements',status:'complete'},
  {id:'a2',kind:'message',detail:'第二轮最终回复'},
 ]);
 assert.deepEqual(rows.filter(row=>row.inProcess).map(row=>row.key), ['n1','n2']);
 assert.ok(rows.filter(row=>['a1','a2'].includes(row.key)).every(row=>!row.inProcess));
});

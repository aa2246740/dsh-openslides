import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Context} from '@deepseek-ai/cordis';
import LlmRuntime,{createUserMessage} from '@deepseek-ai/dsh-llm';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import * as PiAiPlugin from '@deepseek-ai/dsh-llm-pi-ai';

function sse(text,reason,output){
 const events=[{type:'message_start',message:{id:'fixture',type:'message',role:'assistant',content:[],model:'probe',stop_reason:null,usage:{input_tokens:219895,cache_read_input_tokens:11543,output_tokens:0}}}];
 if(text)events.push({type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text}},{type:'content_block_stop',index:0});
 events.push({type:'message_delta',delta:{stop_reason:reason},usage:{output_tokens:output}},{type:'message_stop'});
 return events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}
test('completed replies survive catalog overflow; real zero-output overflow remains an error',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'slides-finish-'));
 const oldFetch=globalThis.fetch,oldKey=process.env.SLIDES_FINISH_TEST_KEY;
 process.env.SLIDES_FINISH_TEST_KEY='synthetic-test-key';
 let response;globalThis.fetch=async()=>new Response(response,{status:200,headers:{'content-type':'text/event-stream'}});
 const ctx=new Context(),fibers=[];
 try{
  fibers.push(await ctx.plugin(LlmRuntime,{}));
  fibers.push(await ctx.plugin(LocalCredentialProvider,{path:path.join(temp,'credentials.yaml'),dshHome:temp,watch:false}));
  fibers.push(await ctx.plugin(PiAiPlugin,{providers:{probe:{api:'anthropic-messages',baseURL:'https://provider.invalid',apiKeyEnv:'SLIDES_FINISH_TEST_KEY',models:[{id:'probe',name:'Probe',input:['text'],contextWindow:204800,maxTokens:4096}]}}}));
  for(const row of [
   {text:'第 2 页已完成修改。',reason:'end_turn',output:69,kind:'stop'},
   {text:'一部分回复',reason:'max_tokens',output:69,kind:'max-tokens'},
   {text:'',reason:'max_tokens',output:0,kind:'error',code:'CONTEXT_WINDOW_EXCEEDED'},
   {text:'',reason:'end_turn',output:0,kind:'error',code:'EMPTY_RESPONSE'},
  ]){
   response=sse(row.text,row.reason,row.output);let finish,usage,content='';
   for await(const chunk of ctx.llm.stream({provider:'probe',model:'probe',maxTokens:256,system:'Synthetic regression.',messages:[createUserMessage({content:[{type:'text',text:'Synthetic request.'}],source:{kind:'user'}})],tools:[]})){
    if(chunk.type==='finish')finish=chunk.reason;
    if(chunk.type==='usage')usage=chunk.usage;
    if(chunk.type==='block-end'&&chunk.block.type==='text')content+=chunk.block.text;
   }
   assert.equal(finish.kind,row.kind);assert.equal(finish.failure?.code,row.code);
   assert.equal(usage.inputTokens+usage.cacheReadTokens,231438);
   assert.equal(content,row.text);
  }
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.SLIDES_FINISH_TEST_KEY;else process.env.SLIDES_FINISH_TEST_KEY=oldKey;for(const f of fibers.reverse())await f.dispose();fs.rmSync(temp,{recursive:true,force:true});}
});

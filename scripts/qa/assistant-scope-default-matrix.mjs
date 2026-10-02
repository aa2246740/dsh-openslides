#!/usr/bin/env node
// Synthetic dialogue only. This probe never opens a user project or sends an Agent turn.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Context} from '@deepseek-ai/cordis';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import * as PiAiPlugin from '@deepseek-ai/dsh-llm-pi-ai';
import YAML from 'yaml';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const home=path.join(root,'.dsh/home');
const output=process.env.SLIDES_SCOPE_QA_OUTPUT || path.join(root,'output/assistant-default-scope-acceptance-2026-09-20');
const baseline=process.argv.includes('--baseline');
const sourceFile=path.join(root,'packages/dsh-slides-host/dist/assistant-intent.js');
const classifierFile=baseline?path.join(root,'.dsh/home/profiles/slides/node_modules/@open-slidestudio/dsh-slides-host/dist/assistant-intent.js'):sourceFile;
if(baseline && fs.readFileSync(classifierFile).equals(fs.readFileSync(sourceFile)))throw Error('The running profile already contains the fix; the historical baseline cannot be reproduced from it.');
const classifierSha256=crypto.createHash('sha256').update(fs.readFileSync(classifierFile)).digest('hex');
const {inferAssistantIntent}=await import(pathToFileURL(classifierFile).href);
const providerId=process.env.SLIDES_SCOPE_QA_PROVIDER || 'opcode';
const model=process.env.SLIDES_SCOPE_QA_MODEL || 'deepseek-v4.1-flash';
const history=[
 {role:'user',at:'2026-09-20T08:00:00Z',text:'把整份观星演示稿改成深蓝背景，所有页面都改。'},
 {role:'assistant',at:'2026-09-20T08:01:00Z',text:'两页的深蓝背景已修改完成，文字均清晰，检查通过。'},
];
const proposal=[
 {role:'user',at:'2026-09-20T08:00:00Z',text:'给整份观星演示稿想个新配色，先不要修改。'},
 {role:'assistant',at:'2026-09-20T08:01:00Z',text:'建议整份文稿所有页面改成墨蓝背景、浅金标题，保持内容和版式。如果你同意，我就按这个方案修改整份文稿。'},
];
const pageProposal=[
 {role:'user',at:'2026-09-20T08:00:00Z',text:'第1、2页标题太长，给我两个修改方案，先不改。'},
 {role:'assistant',at:'2026-09-20T08:01:00Z',text:'方案一：第1、2页标题都压成六个字。方案二：只把第2页标题精简，第1页保留原样。选一个后我来执行。'},
];
const cells=[
 ['literal-full-quote','把背景色改成 #162A46，文字和元素位置保持原样。','current',[],{history,currentPage:2}],
 ['svg-after-global','用SVG设计点背景吧','current',[],{history}],
 ['svg-on-second-page','用SVG设计点背景吧','current',[],{history,currentPage:2}],
 ['color-after-global','背景色改成白色','current',[],{history}],
 ['style-after-global','换个科幻风格','current',[],{history}],
 ['continue-after-completion','继续改背景，加一些星星装饰','current',[],{history}],
 ['plain-svg','用SVG设计点背景吧','current'],
 ['plain-color','换个配色','current'],
 ['ppt-not-deck','PPT背景加点星星装饰','current'],
 ['selection-not-target','背景色换成白色','current',[],{selectedCount:2}],
 ['current-explicit','这一页的背景换成白色','current',[],{history}],
 ['two-pages','1、2两页都把背景色改成白色','pages',[1,2],{history}],
 ['page-exclusion','第2页用白色背景，其他页不要改','pages',[2],{history}],
 ['all-pages','所有页面都用SVG设计点背景吧','deck'],
 ['each-page','每一页都加一点星空背景','deck'],
 ['whole-deck','整份PPT换成科幻风，使用深色背景和青色标题','deck'],
 ['all-except-cover','除了第1页，其余页面都加星星装饰','pages',[2]],
 ['selected','把选中的几个标题改成浅金色','selection',[],{selectedCount:3}],
 ['discuss','先别改，只给我几个背景设计建议','current',[],{intent:'discuss',history}],
 ['confirm-global-proposal','就按你刚才的方案执行','deck',[],{history:proposal}],
 ['confirm-page-proposal','用第二个方案','pages',[2],{history:pageProposal}],
 ['new-task-after-proposal','用SVG设计点背景吧','current',[],{history:proposal}],
 ['english-unspecified','Add some SVG background decorations.','current',[],{history}],
 ['english-whole','Add SVG backgrounds to every slide.','deck'],
 // Structural mutations: pageList mutations are deck scope + structureOnly with
 // the exact authorization fields. expect pins declared fields; any structural
 // key NOT declared must be absent from the parsed result.
 ['add-page','再加一页','deck',[],{expect:{structureOnly:true,insertIndex:2}}],
 ['insert-middle','在第1页后面加一页','deck',[],{expect:{structureOnly:true,insertIndex:1}}],
 ['compound-add-edit','末尾加一页总结，并把第2页标题改大','deck',[],{expect:{structureOnly:true,insertIndex:2,editablePages:[2]}}],
 ['delete-page','删掉第2页','deck',[],{expect:{structureOnly:true,deletablePages:[2]}}],
 ['merge-pages','把第1、2页合并成一页','deck',[],{expect:{structureOnly:true,deletablePages:'*'}}],
 ['reorder-page','把第2页挪到最前面','deck',[],{expect:{structureOnly:true,reorderTo:[2,1]}}],
 // Deck-level metadata grants ride on ordinary scopes.
 ['meta-title','把文稿标题改成季度总结','current',[],{expect:{editableMeta:['title']}}],
 ['meta-theme','整套配色换成深色商务风','deck',[],{expect:{editableMeta:['theme']}}],
 // Full rewrites need the deck-level redo wording; weak wording stays current.
 ['rewrite-strong','完全推翻重做这份PPT','deck',[],{expect:{rewrite:true}}],
 ['rewrite-weak','不太满意，重做一版','current'],
];
// Structural/meta keys not declared in a cell's expect must be absent from
// the parsed intent — that is what keeps a vague request from widening.
const STRUCTURAL_KEYS=['structureOnly','insertIndex','editablePages','deletablePages','reorderTo','addCount','rewrite','editableMeta'];
const settings=YAML.parse(fs.readFileSync(path.join(home,'settings.yaml'),'utf8'));
const provider=settings?.['llm-pi-ai']?.providers?.[providerId];
if(!provider)throw Error('Configured provider unavailable: '+providerId);
const ctx=new Context();const fibers=[];const results=[];
fs.mkdirSync(output,{recursive:true});
try{
 fibers.push(await ctx.plugin(LlmRuntime,{}));
 fibers.push(await ctx.plugin(LocalCredentialProvider,{path:path.join(home,'.credentials.yaml'),dshHome:home,watch:false}));
 fibers.push(await ctx.plugin(PiAiPlugin,{providers:{[providerId]:provider}}));
 const info=await ctx.llm.resolveModelInfo(providerId,model);
 const reasoningEffort=baseline?undefined:info.reasoning?.efforts.find(effort=>effort.id==='low')?.id;
 for(const [id,text,scope,pages=[],extra={}] of (baseline?cells.slice(0,2):cells.slice(0,Number(process.env.SLIDES_SCOPE_QA_LIMIT)||cells.length))){
  const {intent='edit',expect:expectExtra={},...context}=extra;
  const input={text,pageCount:2,currentPage:1,selectedCount:0,history:[],...context};
  const started=Date.now();let result,error;const raw=[];
  try{result=await inferAssistantIntent(async function*(options){ for await(const chunk of ctx.llm.stream(options)){ if(chunk.type==='block-end' && chunk.block.type==='text')raw.push(chunk.block.text); if(chunk.type==='finish' && chunk.reason.kind!=='stop')console.log(JSON.stringify({finish:chunk.reason})); yield chunk; } },{provider:providerId,model,reasoningEffort},input);}
  catch(e){error=e.message;}
  // Every declared field must equal ('*' = present with any value); every
  // undeclared structural/meta key must be absent so vague requests cannot
  // widen into page-list or metadata mutations.
  const declared={intent,scope,pages,...expectExtra};
  const pass=!error && !!result &&
    Object.entries(declared).every(([k,v])=>v==='*'?result[k]!==undefined:JSON.stringify(result[k])===JSON.stringify(v)) &&
    STRUCTURAL_KEYS.every(k=>k in declared?true:result[k]===undefined);
  results.push({id,text,history:input.history,currentPage:input.currentPage,selectedCount:input.selectedCount,expected:declared,result,error,raw,pass,elapsedMs:Date.now()-started});
  fs.writeFileSync(path.join(output,baseline?'model-before.json':'model-after.json'),JSON.stringify({provider:providerId,model,reasoningEffort,classifierSha256,syntheticOnly:true,results},null,2));
  console.log(JSON.stringify({id,result,error,pass,elapsedMs:Date.now()-started}));
 }
}finally{for(const fiber of fibers.reverse())await fiber.dispose();}
console.log(JSON.stringify({baseline,passed:results.filter(x=>x.pass).length,total:results.length}));
if(!baseline && results.some(x=>!x.pass))process.exitCode=1;

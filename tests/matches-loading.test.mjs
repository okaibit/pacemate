import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {parse,compileScript} from '@vue/compiler-sfc';import {rolldown} from 'rolldown';
globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
const f=globalThis.__matchLoading={mount:[],dispose:[],pending:[]};
const {descriptor}=parse(readFileSync('src/views/Matches.vue','utf8'));const script=compileScript(descriptor,{id:'matches-loading'}).content;
const built=await rolldown({input:'matches-fixture',plugins:[{name:'matches-fixtures',resolveId(id){if(id==='matches-fixture')return '\0matches';if(['vue','../api.js','../auth.js'].includes(id)||id.endsWith('.vue'))return '\0fixture:'+id;},load(id){
 if(id==='\0matches')return script;
 if(id==='\0fixture:vue')return 'export const ref=value=>({value});export const computed=fn=>({get value(){return fn();}});export const onMounted=fn=>globalThis.__matchLoading.mount.push(fn);export const onBeforeUnmount=fn=>globalThis.__matchLoading.dispose.push(fn);';
 if(id==='\0fixture:../api.js')return 'export const api=()=>new Promise((resolve,reject)=>globalThis.__matchLoading.pending.push({resolve,reject}));';
 if(id==='\0fixture:../auth.js')return 'export const session={user:{id:"me"}};';
 if(id.startsWith('\0fixture:'))return 'export default {};';
}}]});const output=await built.generate({format:'esm'});await built.close();const {default:Matches}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
test('slow matches refreshes do not overlap; failed refreshes retain conversations and allow retry',async()=>{
 const view=Matches.setup({}, {expose(){}});
 const first=view.load();await view.load();assert.equal(f.pending.length,1);
 f.pending.shift().resolve({matches:[{id:7,last:{body:'Hello'}}]});await first;
 const refresh=view.load();f.pending.shift().reject(new Error('Connection lost'));await refresh;
 assert.equal(view.list.value[0].id,7);assert.equal(view.err.value,'Connection lost');
 const retry=view.load();f.pending.shift().resolve({matches:[{id:7,last:{body:'New message'}}]});await retry;
 assert.equal(view.err.value,'');assert.equal(view.list.value[0].last.body,'New message');
});
test('leaving Matches ignores a late response',async()=>{
 const view=Matches.setup({}, {expose(){}});const request=view.load();f.dispose.at(-1)();f.pending.shift().resolve({matches:[{id:8}]});await request;assert.deepEqual(view.list.value,[]);
});

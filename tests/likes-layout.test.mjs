import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@vue/compiler-sfc';
import {ref} from 'vue';

// Execute the view's actual setup with an isolated API, without hosted calls.
const {descriptor}=parse(readFileSync('src/views/Likes.vue','utf8'));
const setup=descriptor.scriptSetup.content.replace(/^import .*;\n/gm,'');
function view(api){
 return new Function('ref','onMounted','onBeforeUnmount','api','session',setup+'\nreturn {load,people,count,plus,loading,error};')(
  ref,()=>{},()=>{},api,{user:{id:'viewer'}});
}
test('non-Plus likes load only an aggregate, never discovery profiles',async()=>{
 const calls=[];
 const state=view(async(path,options)=>{calls.push(path);assert.equal(options.expectedUserId,'viewer');return path.includes('billing')?{active:false}:{likesYou:3};});
 await state.load();
 assert.deepEqual(calls,['/api/billing/config','/api/today/badges']);
 assert.deepEqual(state.people.value,[]);assert.equal(state.count.value,3);assert.equal(state.loading.value,false);
});
test('Plus likes use the server-authorized likes mode',async()=>{
 const calls=[],people=[{id:'member',name:'A',photos:['own-photo']}];
 const state=view(async path=>{calls.push(path);return path.includes('billing')?{active:true}:{people};});
 await state.load();assert.deepEqual(calls,['/api/billing/config','/api/discover?likes=1']);assert.deepEqual(state.people.value,people);
});
test('failed entitlement fails closed; revoked Plus clears stale profiles',async()=>{
 let entitled=true;
 const state=view(async path=>{
  if(path.includes('billing'))return {active:true};
  if(!entitled)throw Object.assign(new Error('Plus required'),{status:403});
  return {people:[{id:'private'}]};
 });
 await state.load();entitled=false;await state.load();assert.deepEqual(state.people.value,[]);assert.equal(state.error.value,'Plus required');
 const failedCalls=[];
 const failed=view(async path=>{failedCalls.push(path);throw new Error('Unavailable');});
 await failed.load();assert.deepEqual(failedCalls,['/api/billing/config']);assert.deepEqual(failed.people.value,[]);
});
test('empty likes and invalid aggregate counts do not invent a count',async()=>{
 const empty=view(async path=>path.includes('billing')?{active:true}:{people:[]});
 await empty.load();assert.deepEqual(empty.people.value,[]);assert.equal(empty.error.value,'');
 const invalid=view(async path=>path.includes('billing')?{active:false}:{likesYou:'3'});
 await invalid.load();assert.equal(invalid.count.value,null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';
let stopHandler,liveChange,subscriptions,requests,records,failAfterInsert=false;
globalThis.__chatFixture={user:{id:'me'},onDispose:fn=>stopHandler=fn,subscribe:(...args)=>{if(args[0].startsWith('push:'))return ()=>{};liveChange=args[1];subscriptions=args[3];return ()=>{globalThis.__chatFixture.disposed=true;};},api:async()=>({other:{id:'other',name:'Alex'}})};
globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
const compiled=await rolldown({input:'src/composables/useChat.js',plugins:[{name:'chat-fixtures',resolveId(id){if(['vue','../auth.js','../supabase.js','../api.js','../realtime.js','./usePush.js'].includes(id))return '\0chat:'+id;},load(id){if(id==='\0chat:./usePush.js')return 'export const noteMessage=()=>{};export const pushRest=async()=>[];';if(id==='\0chat:vue')return 'export const ref=value=>({value});export const onBeforeUnmount=fn=>globalThis.__chatFixture.onDispose(fn);';if(id==='\0chat:../auth.js')return 'export const session=globalThis.__chatFixture;';if(id==='\0chat:../supabase.js')return `export const SUPABASE_URL='https://chat.supabase.co',PUBLISHABLE_KEY='public';export const authClient={getSession:async()=>({user:globalThis.__chatFixture.user,access_token:'verified'})};`;if(id==='\0chat:../api.js')return 'export const api=(...args)=>globalThis.__chatFixture.api(...args);export const resizeImage=async file=>file;';if(id==='\0chat:../realtime.js')return 'export const subscribe=(...args)=>globalThis.__chatFixture.subscribe(...args);';}}]});
const output=await compiled.generate({format:'esm'});await compiled.close();const {useChat}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
let originalFetch;
const waitFor=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Chat operation did not settle');};
test.beforeEach(()=>{requests=[];records=[];stopHandler=null;failAfterInsert=false;globalThis.__chatFixture.user={id:'me'};globalThis.__chatFixture.disposed=false;globalThis.__chatFixture.api=async(path,options)=>{
 if(path.endsWith('/messages')&&options?.method==='POST'){
  const {body,clientId}=options.body;const row={id:100,sender_id:'me',body,client_id:clientId,created_at:new Date().toISOString(),status:'sent'};records.push(row);
  requests.push({api:true,path,method:'POST'});if(failAfterInsert){failAfterInsert=false;throw Error('Response lost');}
  return {message:{id:row.id,body,createdAt:row.created_at}};
 }return {other:{id:'other',name:'Alex'}};};originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url),table=u.pathname.split('/').at(-1),method=options.method;requests.push({url:u,method,body:options.body&&JSON.parse(options.body)});
  if(table==='conversations')return Response.json([{id:12}]);
  if(table==='message_reactions')return Response.json([]);
  if(method==='POST'){const body=JSON.parse(options.body);const row={...body,id:100,created_at:new Date().toISOString(),status:'sent'};records.push(row);if(failAfterInsert){failAfterInsert=false;throw new Error('Response lost');}return Response.json([row],{status:201});}
  if(method==='PATCH'){const ids=u.searchParams.get('id').slice(4,-1).split(',').map(Number);const selected=records.filter(r=>ids.includes(r.id)&&r.sender_id!=='me');selected.forEach(r=>r.read_at=new Date().toISOString());return Response.json(selected);}
  if(u.searchParams.get('read_at'))return Response.json([],{headers:{'Content-Range':'0-0/'+records.filter(r=>!r.read_at&&r.sender_id!=='me').length}});
  let result=records.slice();const client=u.searchParams.get('client_id');if(client)result=result.filter(r=>r.client_id===client.slice(3));
  const id=u.searchParams.get('id');if(id?.startsWith('lt.'))result=result.filter(r=>r.id<Number(id.slice(3)));if(id?.startsWith('gt.'))result=result.filter(r=>r.id>Number(id.slice(3)));if(id?.startsWith('in.')){const ids=id.slice(4,-1).split(',').map(Number);result=result.filter(r=>ids.includes(r.id));}
  result.sort((a,b)=>u.searchParams.get('order')==='id.desc'?b.id-a.id:a.id-b.id);
  return Response.json(result.slice(0,Number(u.searchParams.get('limit'))||result.length));
 };
});
test.afterEach(()=>{stopHandler?.();globalThis.fetch=originalFetch;});
test('initial page requests latest 30; older page uses a strict ID cursor',async()=>{
 records=Array.from({length:65},(_,i)=>({id:i+1,sender_id:'other',body:'hello',created_at:new Date(2026,0,1,0,i).toISOString()}));
 const chat=useChat(12);await waitFor(()=>!chat.loading.value&&chat.messages.value.length===30);
 assert.equal(chat.messages.value[0].id,36);assert.equal(chat.hasOlder.value,true);await chat.older();assert.equal(chat.messages.value[0].id,6);assert.equal(chat.messages.value.length,60);
 assert.ok(requests.some(r=>r.url.searchParams.get('id')==='lt.36'));assert.equal(subscriptions[0].filter,'conversation_id=eq.12');
});
test('send renders before network completion and reconciles a lost insert response once',async()=>{
 const chat=useChat(12);await waitFor(()=>chat.ready.value&&!chat.loading.value);failAfterInsert=true;
 assert.equal(chat.send('Hello there'),true);assert.equal(chat.messages.value.length,1);assert.equal(chat.messages.value[0].status,'sending');
 await waitFor(()=>chat.messages.value[0]?.status==='sent');assert.equal(chat.messages.value.length,1);assert.equal(records.length,1);assert.ok(requests.some(r=>r.api&&r.path==='/api/matches/12/messages'));assert.ok(!requests.some(r=>!r.api&&r.method==='POST'));
});
test('hidden chats do not send read acknowledgements; visible receipt updates only incoming IDs',async()=>{
 records=[{id:1,sender_id:'other',body:'hello',created_at:new Date().toISOString()},{id:2,sender_id:'me',body:'hi',created_at:new Date().toISOString()}];
 const chat=useChat(12);await waitFor(()=>chat.messages.value.length===2&&!chat.loading.value);
 document.visibilityState='hidden';await chat.markRead([1,2]);assert.ok(!requests.some(r=>r.method==='PATCH'));
 document.visibilityState='visible';await chat.markRead([1,2]);const patch=requests.find(r=>r.method==='PATCH');assert.equal(patch.url.searchParams.get('id'),'in.(1)');assert.ok(chat.messages.value[0].read_at);assert.ok(!chat.messages.value[1].read_at);
});
test('unmount removes subscriptions and prevents subsequent writes',async()=>{
 const chat=useChat(12);await waitFor(()=>chat.ready.value&&!chat.loading.value);stopHandler();assert.equal(globalThis.__chatFixture.disposed,true);const previous=requests.length;
 chat.send('After leaving');await new Promise(resolve=>setTimeout(resolve,15));assert.equal(requests.length,previous);
});

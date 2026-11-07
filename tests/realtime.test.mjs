import test from 'node:test';
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';
const sockets=[];let authListener,unsubscribeCount=0;
globalThis.__realtimeSession={access_token:'private-user-token'};
globalThis.__realtimeListen=fn=>{authListener=fn;return ()=>{unsubscribeCount++;};};
const visibility=new Map();
globalThis.document={visibilityState:'visible',addEventListener:(name,fn)=>visibility.set(name,fn),removeEventListener:name=>visibility.delete(name)};
class FakeSocket {
  static OPEN=1;static CLOSED=3;
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
  send(value){this.sent.push(JSON.parse(value));}
  open(){this.readyState=1;this.onopen();}
  receive(message){this.onmessage({data:JSON.stringify(message)});}
  close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.();}
}
globalThis.WebSocket=FakeSocket;
const bundle=await rolldown({input:'src/realtime.js',plugins:[{name:'auth-fixture',resolveId(id){if(id.endsWith('supabase.js'))return '\0realtime-auth';},load(id){if(id==='\0realtime-auth')return `export const SUPABASE_URL='https://project.supabase.co',PUBLISHABLE_KEY='public-key';export const authClient={getSession:async()=>globalThis.__realtimeSession,onChange:fn=>globalThis.__realtimeListen(fn)};`;}}]});
const output=await bundle.generate({format:'esm'});await bundle.close();
const {subscribe}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));

test('Realtime joins a private authenticated channel and receives change signals',async()=>{
  let changes=0,state=false;const stop=subscribe('match:12',()=>changes++,value=>state=value);
  try{
    await Promise.resolve();await Promise.resolve();const socket=sockets.at(-1);socket.open();
    assert.ok(!socket.url.includes('private-user-token'));
    const join=socket.sent[0];assert.equal(join.event,'phx_join');assert.equal(join.topic,'realtime:match:12');assert.equal(join.payload.config.private,true);assert.equal(join.payload.access_token,'private-user-token');
    socket.receive({topic:join.topic,event:'phx_reply',ref:'1',payload:{status:'ok'}});assert.equal(state,true);assert.equal(changes,1);
    socket.receive({topic:join.topic,event:'broadcast',payload:{event:'changed',payload:{changed:true}}});assert.equal(changes,2);
    socket.receive({topic:'realtime:match:999',event:'broadcast',payload:{event:'changed'}});assert.equal(changes,2);
  }finally{stop();}
  assert.equal(visibility.size,0);assert.equal(unsubscribeCount,1);
});
test('a refreshed JWT is sent in-band without creating a second socket',async()=>{
  const stop=subscribe('event:4',()=>{});
  try{
    await Promise.resolve();await Promise.resolve();const socket=sockets.at(-1);socket.open();
    socket.receive({topic:'realtime:event:4',event:'phx_reply',ref:'1',payload:{status:'ok'}});
    const count=sockets.length;globalThis.__realtimeSession={access_token:'renewed-token'};await authListener('TOKEN_REFRESHED',{id:'member'});
    assert.equal(sockets.length,count);assert.equal(socket.sent.at(-1).event,'access_token');assert.equal(socket.sent.at(-1).payload.access_token,'renewed-token');
  }finally{stop();}
});

test('Postgres Changes subscriptions filter inserts and receipts by conversation',async()=>{
 const filters=[{event:'INSERT',schema:'public',table:'messages',filter:'conversation_id=eq.12'},{event:'UPDATE',schema:'public',table:'messages',filter:'conversation_id=eq.12'}];
 let changes=0;const stop=subscribe('match:12',()=>changes++,()=>{},filters);
 try{await Promise.resolve();await Promise.resolve();const socket=sockets.at(-1);socket.open();assert.deepEqual(socket.sent[0].payload.config.postgres_changes,filters);
 socket.receive({topic:'realtime:match:12',event:'postgres_changes',payload:{data:{type:'UPDATE',record:{id:8,read_at:'now'}}}});assert.equal(changes,1);
 }finally{stop();}assert.equal(sockets.at(-1).sent.at(-1).event,'phx_leave');
});

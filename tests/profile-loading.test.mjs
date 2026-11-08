import test from 'node:test';
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';
const state=globalThis.__profileLoading={pending:[],listener:null,callbackError:false};
const compiled=await rolldown({input:'src/auth.js',plugins:[{name:'profile-fixtures',resolveId(id){if(['vue','./supabase.js','./api.js','./pwa.js'].includes(id))return '\0profile:'+id;},load(id){
 if(id==='\0profile:vue')return 'export const reactive=value=>value;';
 if(id==='\0profile:./supabase.js')return `export const authClient={handleCallback:async()=>{if(globalThis.__profileLoading.callbackError)throw new Error("Sign-in callback rejected. Start sign-in again in this browser.");return null;},getUser:async()=>null,onChange:fn=>{globalThis.__profileLoading.listener=fn;}};`;
 if(id==='\0profile:./api.js')return `export const api=()=>new Promise((resolve,reject)=>globalThis.__profileLoading.pending.push({resolve,reject}));`;
 if(id==='\0profile:./pwa.js')return 'export const disablePush=async()=>{};';
}}]});
const output=await compiled.generate({format:'esm'});await compiled.close();
const {session,initAuth,loadProfile}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
test('sign-in listener and login completion share one profile request',async()=>{
 await initAuth();state.listener('SIGNED_IN',{id:'member-a'});
 const completion=loadProfile();assert.equal(state.pending.length,1);
 state.pending.shift().resolve({profile:{id:'member-a',name:'Alex'}});await completion;assert.equal(session.profile.name,'Alex');
});
test('an old account response cannot overwrite a newer account profile',async()=>{
 session.user={id:'member-a'};const old=loadProfile();const previous=state.pending.shift();
 session.user={id:'member-b'};const next=loadProfile();const current=state.pending.shift();
 current.resolve({profile:{id:'member-b'}});await next;previous.resolve({profile:{id:'member-a'}});await old;
 assert.equal(session.profile.id,'member-b');
});
test('a failed profile request can be retried',async()=>{
 session.user={id:'member-c'};const failed=loadProfile();state.pending.shift().reject(new Error('Offline'));await assert.rejects(failed,/Offline/);
 const retry=loadProfile();assert.equal(state.pending.length,1);state.pending.shift().resolve({profile:null});await retry;assert.equal(session.profileError,'');
});

test('callback rejection routes to Auth, removes the callback URL and exposes the error',async()=>{
 const originalWindow=globalThis.window;
 const paths=[];globalThis.window={history:{replaceState:(state,title,path)=>paths.push(path)}};
 state.callbackError=true;
 try {
  await initAuth();
  assert.equal(session.callback,'error');assert.deepEqual(paths,['/login']);assert.match(session.notice,/callback rejected/);assert.equal(session.ready,true);
 } finally {globalThis.window=originalWindow;state.callbackError=false;}
});

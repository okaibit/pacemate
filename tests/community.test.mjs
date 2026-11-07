import test from 'node:test';
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';
import {verifyStripeSignature,validPushSubscription,distanceKm,internalHref,cityKey} from '../supabase/functions/pacemate/server/validation.js';

const member={id:'member-a',name:'Alex',birthdate:'1994-04-10',gender:'Man',interestedIn:['Woman'],sports:['Running'],ageMin:18,ageMax:60,homeCity:'Abuja',currentCity:'Abuja',photos:['member-a/main.jpg'],paused:false,suspended:false};
let handler;
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only-test',PACEMATE_DATABASE_URL:'postgresql://user:pass@host/db'};
globalThis.Deno={env:{get:name=>env[name]},serve:fn=>handler=fn};
let profile,sqlHandler,calls,fetchCalls;
globalThis.__communityProfile=()=>profile;
globalThis.__communityClient={
  async unsafe(sql,params=[]){calls.push({sql,params});return sqlHandler(sql,params);},
  begin(fn){return fn(this);},
};
const compiled=await rolldown({input:'supabase/functions/pacemate/index.ts',plugins:[{
  name:'isolated-community-backend',
  resolveId(id){
    if(id.endsWith('/db/index.ts'))return '\0community-db';
    if(id==='web-push')return '\0community-push';
  },
  load(id){
    if(id==='\0community-db')return `export const withDatabaseDeadline=fn=>fn(globalThis.__communityClient);export const db={select(){return {from(){return {where:async()=>globalThis.__communityProfile()?[globalThis.__communityProfile()]:[]}}}}};export async function checkDatabase(){return {status:'ok'}};`;
    if(id==='\0community-push')return `export default {setVapidDetails(){},sendNotification(){throw new Error('Push must not be sent by a regression test')}}`;
  },
}]});
const output=await compiled.generate({format:'esm',codeSplitting:false,minify:true});await compiled.close();
await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
const originalFetch=globalThis.fetch;
test.beforeEach(()=>{
  profile={...member,photos:[...member.photos]};calls=[];fetchCalls=[];
  sqlHandler=async sql=>{
    if(sql.includes('feature_limits'))return [{hits:1}];
    if(sql.includes('pg_advisory_xact_lock'))return [{}];
    return [];
  };
  globalThis.fetch=async(url,options)=>{fetchCalls.push({url,options});if(url.endsWith('/auth/v1/user'))return Response.json({id:member.id,email:'test@example.com'});throw new Error('Unexpected external request');};
});
test.afterEach(()=>{globalThis.fetch=originalFetch;});
function request(path,method='GET',body){return handler(new Request('https://function.test/pacemate'+path,{method,headers:{Authorization:'Bearer verified-user',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}));}

test('an authenticated member cannot grant themselves administrator access',async()=>{
  const response=await request('/api/admin/members/other','POST',{action:'suspend',note:'test',isAdmin:true,role:'admin'});
  assert.equal(response.status,403);
  assert.ok(calls.some(call=>call.sql.includes('app_admins')&&call.params[0]===member.id));
  assert.ok(!calls.some(call=>/UPDATE|INSERT|DELETE/.test(call.sql)));
});
test('suspended members cannot use protected community workflows',async()=>{
  profile.suspended=true;
  const response=await request('/api/notifications');assert.equal(response.status,403);
});
test('unrelated members cannot open a match or upload a photo into it',async()=>{
  assert.equal((await request('/api/matches/22/messages')).status,404);
  assert.equal((await request('/api/matches/22/attachments','POST',{anything:true})).status,404);
  assert.ok(!fetchCalls.some(call=>call.url.includes('/storage/')));
});
test('a member cannot reuse another member’s attachment',async()=>{
  sqlHandler=async sql=>{
    if(sql.includes('feature_limits')||sql.includes('pg_advisory'))return [{}];
    if(sql.includes('SELECT m.*,CASE'))return [{id:22,user_a:member.id,user_b:'member-b',other_id:'member-b'}];
    if(sql.includes('SELECT 1 FROM public.matches'))return [{}];
    if(sql.includes('chat_attachments'))return [];
    return [];
  };
  const response=await request('/api/matches/22/messages','POST',{body:'Hello',attachmentId:'not-owned'});
  assert.equal(response.status,422);assert.ok(!calls.some(call=>call.sql.startsWith('INSERT INTO public.messages')));
});
test('read receipts clamp acknowledgements to messages in that match',async()=>{
  sqlHandler=async sql=>sql.includes('SELECT m.*,CASE')?[{id:22,user_a:member.id,user_b:'b',other_id:'b'}]:sql.includes('max(id)')?[{id:18}]:[];
  const response=await request('/api/matches/22/messages','PUT',{lastReadId:9999});assert.equal(response.status,200);
  const write=calls.find(call=>call.sql.includes('INSERT INTO public.match_reads'));assert.deepEqual(write.params,[22,member.id,18]);
});
test('session capacity is checked after a row lock and prevents the insert',async()=>{
  sqlHandler=async sql=>{
    if(sql.includes('SELECT * FROM public.events'))return [{id:7,host_id:'host',capacity:2,weekly:true,starts_at:'2026-11-10T10:00:00Z'}];
    if(sql.includes('SELECT 1 WHERE'))return [{}];
    if(sql.includes('count(*)'))return [{n:2}];
    return [];
  };
  const response=await request('/api/events/7/rsvp','POST',{going:true});assert.equal(response.status,409);
  assert.ok(calls.some(call=>call.sql.includes('FOR UPDATE')));assert.ok(!calls.some(call=>call.sql.startsWith('INSERT INTO public.rsvps')));
});
test('session editing cannot lower capacity below existing attendance',async()=>{
  sqlHandler=async sql=>sql.includes('SELECT * FROM public.events')?[{id:7,host_id:member.id}]:sql.includes('SELECT user_id')?[{user_id:'a'},{user_id:'b'},{user_id:'c'}]:[];
  const response=await request('/api/events/7','PUT',{title:'Run',kind:'Run',city:'Abuja',location:'Park',startsAt:new Date(Date.now()+86400000).toISOString(),timezone:'Africa/Lagos',capacity:2,weekly:false});
  assert.equal(response.status,409);assert.ok(!calls.some(call=>call.sql.startsWith('UPDATE public.events')));
});
test('members must RSVP or host before reading session chat',async()=>{assert.equal((await request('/api/events/7/messages')).status,403);});
test('export binds the verified user and rejects arbitrary table selection',async()=>{
  assert.equal((await request('/api/export?section=auth.users')).status,422);
  await request('/api/export?section=messages&userId=other');
  const read=calls.find(call=>call.sql.includes('public.messages'));
  assert.ok(read.sql.includes('sender_id=$1'));assert.equal(read.params[0],member.id);
});
test('verification requires a profile photo and cannot approve itself',async()=>{
  profile.photos=[];
  assert.equal((await request('/api/verification','POST',{fake:true})).status,422);
  assert.ok(!fetchCalls.some(call=>call.url.includes('/storage/')));
});
test('multiple travel plans cannot be enabled by spoofing premium in a payload',async()=>{
  assert.equal((await request('/api/trips','POST',{city:'Paris',arrival:'2027-01-10',premium:true})).status,403);
  assert.ok(!calls.some(call=>call.sql.startsWith('INSERT INTO public.travel_plans')));
});
test('background delivery requires its separate scheduler credential',async()=>{
  const response=await request('/api/tasks/dispatch','POST',{});assert.equal(response.status,401);assert.equal(calls.length,0);
});
test('billing is disabled without explicit configuration and signed webhooks',async()=>{
  const response=await request('/api/billing/checkout','POST',{});assert.equal(response.status,503);
  assert.equal((await request('/api/billing/webhook','POST',{type:'checkout.session.completed'})).status,400);
});
test('push rejects arbitrary network targets and requires valid subscription keys',()=>{
  const value={endpoint:'https://fcm.googleapis.com/fcm/send/random',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
  assert.equal(validPushSubscription(value),true);
  for(const endpoint of ['http://127.0.0.1/admin','https://fcm.googleapis.com.evil.example/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x'])assert.equal(validPushSubscription({...value,endpoint}),false);
});
test('Stripe verification rejects altered payloads, old events, and forged signatures',async()=>{
  const body=JSON.stringify({id:'evt_test'}),secret='test-secret',now=Date.now(),stamp=Math.floor(now/1000);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stamp+'.'+body))).toString('hex');
  const header=`t=${stamp},v1=${signature}`;
  assert.equal(await verifyStripeSignature(body,header,secret,now),true);
  assert.equal(await verifyStripeSignature(body+' ',header,secret,now),false);
  assert.equal(await verifyStripeSignature(body,header,secret,now+601000),false);
  assert.equal(await verifyStripeSignature(body,header,'wrong-secret',now),false);
});
test('distance and notification links preserve city-level privacy and same-origin navigation',()=>{
  assert.equal(cityKey('São Paulo'),'sao paulo');
  assert.equal(distanceKm({latitude:9,longitude:7},{latitude:9,longitude:7}),0);
  assert.ok(Math.abs(distanceKm({latitude:0,longitude:0},{latitude:0,longitude:1})-111.195)<0.1);
  assert.equal(internalHref('//evil.example'),'/app/notifications');assert.equal(internalHref('/app/\\evil.example'),'/app/notifications');
});

test('moderators cannot approve their own verification even with a confirmed checkbox',async()=>{
  sqlHandler=async sql=>{
    if(sql.includes('app_admins'))return [{}];
    if(sql.includes('SELECT 1 FROM public.verification_requests'))return [{}];
    if(sql.includes('SELECT v.*'))return [{id:'request',user_id:member.id,photos:member.photos,profile_photos:member.photos,status:'pending'}];
    return [];
  };
  const response=await request('/api/admin/verifications/request','POST',{status:'approved',confirmed:true,note:'Compared carefully'});
  assert.equal(response.status,403);assert.ok(!calls.some(c=>c.sql.includes('SET verified=')));
});
test('verification approval rejects photos changed since submission',async()=>{
  sqlHandler=async sql=>sql.includes('app_admins')||sql.includes('SELECT 1 FROM public.verification_requests')?[{}]:sql.includes('SELECT v.*')?[{id:'request',user_id:'member-b',photos:['new.jpg'],profile_photos:['old.jpg']}]:[];
  const response=await request('/api/admin/verifications/request','POST',{status:'approved',confirmed:true,note:'Compared carefully'});
  assert.equal(response.status,409);assert.ok(!calls.some(c=>c.sql.includes('SET verified=')));
});
test('verification approval records the reviewer and grants a badge only to the reviewed member',async()=>{
  sqlHandler=async sql=>sql.includes('app_admins')||sql.includes('SELECT 1 FROM public.verification_requests')?[{}]:sql.includes('SELECT v.*')?[{id:'request',user_id:'member-b',photos:['main.jpg'],profile_photos:['main.jpg'],selfie_key:null}]:[];
  const response=await request('/api/admin/verifications/request','POST',{status:'approved',confirmed:true,note:'Selfie matches the photos'});
  assert.equal(response.status,200);
  assert.deepEqual(calls.find(c=>c.sql.includes('SET verified=')).params,['member-b',true]);
  assert.ok(calls.some(c=>c.sql.includes('moderation_actions')&&c.params[0]===member.id));
});
test('export pages are bounded and keep ownership filters across subsequent pages',async()=>{
  sqlHandler=async sql=>sql.includes('public.messages')?Array.from({length:101},(_,i)=>({id:i+1,body:'own message'})):[];
  const response=await request('/api/export?section=messages&offset=100');const result=await response.json();
  assert.equal(result.records.length,100);assert.equal(result.hasMore,true);assert.equal(result.nextOffset,200);
  assert.deepEqual(calls.find(c=>c.sql.includes('public.messages')).params,[member.id,100]);
});
test('prototype property names cannot be used as export sections',async()=>{assert.equal((await request('/api/export?section=constructor')).status,422);});
test('oversized message JSON is rejected before a message insert',async()=>{
  sqlHandler=async sql=>sql.includes('feature_limits')?[{}]:sql.includes('SELECT m.*,CASE')?[{id:22,user_a:member.id,user_b:'b',other_id:'b'}]:[];
  const response=await request('/api/matches/22/messages','POST',{body:'x'.repeat(70000)});
  assert.equal(response.status,413);assert.ok(!calls.some(c=>c.sql.startsWith('INSERT INTO public.messages')));
});

test('chat metadata and preview endpoints reject unrelated members before storage or provider access',async()=>{
 assert.equal((await request('/api/matches/22/chat')).status,404);
 assert.equal((await request('/api/matches/22/chat','POST',{messageId:1})).status,404);
 assert.ok(!fetchCalls.some(call=>!call.url.endsWith('/auth/v1/user')));
});
test('a chat member cannot enrich another sender’s message',async()=>{
 sqlHandler=async sql=>sql.includes('SELECT m.*,CASE')?[{id:22,user_a:member.id,user_b:'other',other_id:'other'}]:[];
 const response=await request('/api/matches/22/chat','POST',{messageId:123});assert.equal(response.status,404);
 assert.ok(calls.some(call=>call.sql.includes('sender_id=$3')&&call.params[2]===member.id));
 assert.ok(!fetchCalls.some(call=>call.url.includes('microlink')));
});
test('preview enrichment stays off without explicit provider opt-in',async()=>{
 sqlHandler=async sql=>{
  if(sql.includes('SELECT m.*,CASE'))return [{id:22,user_a:member.id,user_b:'other',other_id:'other'}];
  if(sql.includes('SELECT * FROM public.messages'))return [{id:123,match_id:22,sender_id:member.id,body:'A link',link_url:'https://example.com/article'}];return [];
 };
 const response=await request('/api/matches/22/chat','POST',{messageId:123});assert.equal(response.status,200);assert.equal((await response.json()).message.id,123);
 assert.ok(!fetchCalls.some(call=>call.url.includes('microlink')));assert.ok(!calls.some(call=>call.sql.startsWith('UPDATE public.messages')));
});

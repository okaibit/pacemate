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
    if(id==='\0community-db')return `export const withDatabaseDeadline=fn=>fn(globalThis.__communityClient);export const db={select(){return {from(){return {where:async()=>globalThis.__communityProfile()?[globalThis.__communityProfile()]:[]}}}},transaction:fn=>fn({execute:q=>globalThis.__communityExecute(q),insert:table=>globalThis.__communityInsert(table)}),insert:table=>globalThis.__communityInsert(table)};export async function checkDatabase(){return {status:'ok'}};`;
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
  globalThis.fetch=async(url,options)=>{fetchCalls.push({url,options});if(url.endsWith('/auth/v1/user'))return Response.json({id:member.id,email:'test@example.com',app_metadata:{pacemate_adult_terms_accepted_at:'2026-11-08T00:00:00.000Z'}});throw new Error('Unexpected external request');};
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
 sqlHandler=async sql=>sql.includes('SELECT m.*,CASE')?[{id:22,user_a:member.id,user_b:'b',other_id:'b'}]:sql.includes('SELECT 1 FROM public.matches m')?[{}]:sql.includes('max(id)')?[{id:18}]:[];
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
  const response=await request('/api/billing/checkout','POST',{});assert.equal(response.status,410);
  assert.equal((await request('/api/billing/webhook','POST',{type:'checkout.session.completed'})).status,410);
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

test('matches surfaces a wrapped database disconnect as a retryable failure with a request reference',async()=>{
 sqlHandler=async sql=>{if(sql.includes('FROM public.matches m JOIN public.profiles'))throw new Error('private query',{cause:Object.assign(new Error('private connection'),{code:'CONNECTION_CLOSED'})});return [];};
 const response=await request('/api/matches');const data=await response.json();
 assert.equal(response.status,503);assert.equal(data.code,'CONNECTION_CLOSED');assert.match(data.requestId,/^[0-9a-f-]{36}$/);
 assert.ok(!JSON.stringify(data).includes('private'));
});

test('matches decodes raw profile arrays while preserving match identifiers',async()=>{
 sqlHandler=async sql=>sql.includes('FROM public.matches m JOIN public.profiles')?[{...member,sports:'{Running,Football}',photos:'{member-a/main.jpg}',match_id:22,matched_at:'2026-11-07T12:00:00Z',last:null,unread:0}]:[];
 const response=await request('/api/matches');const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.matches[0].id,22);assert.equal(data.matches[0].intention,null);assert.equal(data.matches[0].legacy,true);assert.equal(data.matches[0].archived,false);assert.deepEqual(data.matches[0].other.sports,['Running','Football']);assert.deepEqual(data.matches[0].other.photos,['member-a/main.jpg']);
});

const foundationData={...member,current_city:'Abuja',country:'Nigeria',birthdate:'1994-04-10',connection_modes:['training_partner','friendship'],languages:['English'],preferred_days:['Monday'],preferred_times:['Morning'],preferred_intensity:'moderate',lifestyle_interests:['Reading'],user_sports:[{sport_id:'running',name:'Running',experience_level:'intermediate',preferred_intensity:'moderate'}],email:'private@example.test',phone:'123',address:'Private address'};
const foundationPayload={name:'Alex',birthdate:'1994-04-10',city:'Abuja',country:'Nigeria',bio:'Runner',languages:['English'],photos:[],preferred_days:['Monday'],preferred_times:['Morning'],preferred_intensity:'moderate',lifestyle_interests:['Reading'],connection_modes:['training_partner','friendship'],user_sports:foundationData.user_sports};
test('foundation reads expose birthdate only to owner and catalog requires authentication',async()=>{
 sqlHandler=async sql=>sql.includes('AS user_sports')?[foundationData]:sql.includes('SELECT id,name FROM public.sports')?[{id:'running',name:'Running'}]:[];
 const own=await (await request('/api/foundation')).json();assert.equal(own.profile.birthdate,foundationData.birthdate);
 const other=await (await request('/api/foundation/members/member-b')).json();
 for(const key of ['birthdate','email','phone','address'])assert.ok(!Object.hasOwn(other.profile,key));
 assert.equal(typeof other.profile.age,'number');
 assert.deepEqual((await (await request('/api/foundation/sports')).json()).sports,[{id:'running',name:'Running'}]);
 assert.equal((await handler(new Request('https://function.test/pacemate/api/foundation/sports'))).status,401);
});
test('foundation rejects underage non-dating saves, invalid birthdays and modes before writing',async()=>{
 for(const patch of [{birthdate:new Date(Date.UTC(new Date().getUTCFullYear()-17,0,1)).toISOString().slice(0,10)},{birthdate:'2000-02-30'},{connection_modes:['unknown']},{connection_modes:[]},{user_sports:[]},{user_sports:[{...foundationData.user_sports[0],experience_level:'expert'}]}]){
  calls=[];const response=await request('/api/foundation','PUT',{...foundationPayload,...patch});assert.equal(response.status,422);assert.equal(calls.length,0);
 }
});
test('foundation saves are bound to verified caller and preserve multiple modes',async()=>{
 sqlHandler=async(sql,params)=>{
  if(sql.startsWith('SELECT id,suspended'))return [{id:member.id,suspended:false}];
  if(sql.startsWith('SELECT id FROM public.sports'))return [{id:'running'}];
  if(sql.includes('AS user_sports'))return [foundationData];
  return [];
 };
 const response=await request('/api/foundation','PUT',{...foundationPayload,id:'victim',user_id:'victim',verification_status:'verified'});
 assert.equal(response.status,200);
 const update=calls.find(c=>c.sql.startsWith('UPDATE public.profiles'));
 assert.equal(update.params[0],member.id);assert.equal(update.params[11],'{"training_partner","friendship"}');
 assert.ok(!update.sql.includes('verification_status='));assert.equal((await response.json()).profile.birthdate,foundationData.birthdate);
});
test('foundation rechecks suspension inside its save transaction',async()=>{
 sqlHandler=async sql=>sql.startsWith('SELECT id,suspended')?[{id:member.id,suspended:true}]:[];
 assert.equal((await request('/api/foundation','PUT',foundationPayload)).status,403);
 assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE')));
});
test('discovery returns deterministic compatibility from profile data without private fields',async()=>{
 sqlHandler=async sql=>sql.includes('AS user_sports')?[{...foundationData,id:sql.includes('JOIN public.profiles v')?'member-b':member.id,distance_km:null}]:[];
 const result=await (await request('/api/discover?intention=play')).json();
 assert.deepEqual(result.people[0].sharedConnectionModes,['training_partner','friendship']);
 assert.equal(result.people[0].compatibility.score,100);assert.ok(result.people[0].compatibility.reasons.includes('Both enjoy running'));
 for(const key of ['birthdate','email','phone','address'])assert.ok(!Object.hasOwn(result.people[0],key));
 const again=await (await request('/api/discover?intention=play')).json();assert.deepEqual(again.people[0].compatibility,result.people[0].compatibility);
});
test('discovery and likes authorize through the same mode and conditional dating predicate',async()=>{
 sqlHandler=async sql=>sql.includes('AS user_sports')?[{...foundationData,id:sql.includes('JOIN public.profiles v')?'member-b':member.id}]:[];
 await request('/api/discover?intention=date');
 const discoverSQL=calls.find(c=>c.sql.includes('JOIN public.profiles v')).sql;
 calls=[];
 sqlHandler=async sql=>sql.includes('feature_limits')?[{hits:1}]:sql.includes('SELECT p.* FROM public.profiles p JOIN public.profiles v')?[{...foundationData,id:'member-b'}]:[];
 assert.equal((await request('/api/swipes','POST',{targetId:'member-b',liked:true,intention:'date'})).status,200);
 const likeSQL=calls.find(c=>c.sql.includes('JOIN public.profiles v')).sql;
 for(const sql of [discoverSQL,likeSQL]){
  assert.ok(sql.includes('p.connection_modes && v.connection_modes'));
  assert.ok(sql.includes("'dating'=ANY(p.connection_modes) AND 'dating'=ANY(v.connection_modes)"));
  assert.ok(sql.includes('p.gender=ANY(v.interested_in) AND v.gender=ANY(p.interested_in)'));
  assert.ok(sql.includes('BETWEEN v.age_min AND v.age_max'));assert.ok(sql.includes('BETWEEN p.age_min AND p.age_max'));
 }
 assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO public.swipes')));
});
test('dating preferences do not enter Play or Friend discovery or swipe authorization',async()=>{
 for(const intention of ['play','friend']){
  calls=[];
  sqlHandler=async(sql,params=[])=>sql.includes('AS user_sports')?[{...foundationData,id:sql.includes('JOIN public.profiles v')?'member-b':member.id}]:sql.includes('feature_limits')?[{hits:1}]:sql.includes('SELECT p.* FROM public.profiles p JOIN')?[{...foundationData,id:'member-b'}]:[];
  assert.equal((await request(`/api/discover?intention=${intention}`)).status,200);
  const discovery=calls.find(c=>c.sql.includes('JOIN public.profiles v')).sql;
  assert.match(discovery,/AND TRUE/);assert.doesNotMatch(discovery,/p\.gender=ANY\(v\.interested_in\)/);
  calls=[];
  assert.equal((await request('/api/swipes','POST',{targetId:'member-b',liked:false,intention})).status,200);
  const authorization=calls.find(c=>c.sql.includes('SELECT p.* FROM public.profiles p JOIN')).sql;
  assert.match(authorization,/AND TRUE/);assert.doesNotMatch(authorization,/p\.gender=ANY\(v\.interested_in\)/);
 }
});
test('an ineligible or newly blocked target cannot be liked or matched',async()=>{
 sqlHandler=async sql=>sql.includes('feature_limits')?[{hits:1}]:[];
 assert.equal((await request('/api/swipes','POST',{targetId:'member-b',liked:true,intention:'play'})).status,404);
 const authorization=calls.find(c=>c.sql.includes('SELECT p.* FROM public.profiles p JOIN')).sql;
 assert.match(authorization,/b\.blocker_id=v\.id AND b\.blocked_id=p\.id/);assert.match(authorization,/b\.blocker_id=p\.id AND b\.blocked_id=v\.id/);
 assert.ok(!calls.some(c=>c.sql.startsWith('INSERT INTO public.swipes')||c.sql.startsWith('INSERT INTO public.matches')));
});
test('reciprocal eligible likes create a match and return only public profile fields',async()=>{
 sqlHandler=async sql=>{
  if(sql.includes('feature_limits'))return [{hits:1}];
  if(sql.includes('JOIN public.profiles v'))return [{...foundationData,id:'member-b'}];
  if(sql.startsWith('SELECT s.acted_at'))return [{acted_at:new Date().toISOString()}];
  if(sql.includes('max(ended_at)'))return [{ended_at:null}];
  if(sql.startsWith('INSERT INTO public.matches'))return [{id:42}];
  return [];
 };
 const response=await request('/api/swipes','POST',{targetId:'member-b',liked:true,intention:'play'});
 assert.equal(response.status,200);const {match}=await response.json();assert.equal(match.id,42);
 for(const key of ['birthdate','email','phone','address'])assert.ok(!Object.hasOwn(match.other,key));
 assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO public.matches')));
});
test('the legacy profile save still rejects non-dating minors server-side',async()=>{
 const birthdate=new Date(Date.UTC(new Date().getUTCFullYear()-17,0,1)).toISOString().slice(0,10);
 const response=await request('/api/me','PUT',{birthdate,goal:'A training partner'});
 assert.equal(response.status,422);assert.match((await response.json()).error,/18 or older/);
});
test('foundation save rejects foreign and missing photo objects before writing',async()=>{
 sqlHandler=async sql=>sql.startsWith('SELECT id,suspended')?[{id:member.id,suspended:false}]:sql.startsWith('SELECT id FROM public.sports')?[{id:'running'}]:[];
 for(const photos of [['member-b/foreign.jpg'],[member.id+'/missing.jpg']]){
  calls=[];assert.equal((await request('/api/foundation','PUT',{...foundationPayload,photos})).status,422);
  assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE')));
 }
});

test('city suggestion works before onboarding and returns only a nearby city',async()=>{
 profile=null;
 sqlHandler=async sql=>sql.includes('feature_limits')?[{hits:1}]:sql.includes('FROM public.city_coordinates')?[{display_name:'Lagos'}]:[];
 const response=await request('/api/location','POST',{latitude:6.52,longitude:3.38});assert.equal(response.status,200);assert.deepEqual(await response.json(),{city:'Lagos'});
 const query=calls.find(c=>c.sql.includes('FROM public.city_coordinates'));assert.deepEqual(query.params,[6.52,3.38]);assert.ok(query.sql.includes('distance<=100'));
 assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE')||c.sql.includes('INSERT INTO public.profiles')));
 assert.ok(fetchCalls.every(call=>call.url.endsWith('/auth/v1/user')));
});
test('location rejects invalid coordinates, keeps no-match as manual entry, and requires a bearer',async()=>{
 for(const position of [{latitude:91,longitude:0},{latitude:0,longitude:-181},{latitude:'6.52',longitude:3.38},{latitude:null,longitude:0}])assert.equal((await request('/api/location','POST',position)).status,422);
 sqlHandler=async sql=>sql.includes('feature_limits')?[{hits:1}]:[];
 assert.deepEqual(await (await request('/api/location','POST',{latitude:0,longitude:0})).json(),{city:null});
 assert.equal((await handler(new Request('https://function.test/pacemate/api/location',{method:'POST',body:'{}'}))).status,401);
});

test('unacknowledged users cannot save profiles, use Foundation or reach Discover',async()=>{
 globalThis.fetch=async()=>Response.json({id:member.id,user_metadata:{terms_accepted_at:'2026-11-08T00:00:00Z',adultTermsAccepted:true}});
 for(const [path,method,payload] of [['/api/me','PUT',{adultTermsAccepted:true}],['/api/foundation','PUT',foundationPayload],['/api/discover','GET',undefined]]){
  const response=await request(path,method,payload);assert.equal(response.status,403);assert.match((await response.json()).error,/accept the terms/);
 }
 assert.equal(calls.length,0);
});

test('acknowledgement rejects false, missing and string values before any admin write',async()=>{
 for(const adultTermsAccepted of [false,undefined,'true']){
  const response=await request('/api/me','POST',{adultTermsAccepted});assert.equal(response.status,422);
 }
 assert.ok(fetchCalls.every(call=>call.url.endsWith('/auth/v1/user')));
 assert.equal((await handler(new Request('https://function.test/pacemate/api/me',{method:'POST',body:JSON.stringify({adultTermsAccepted:true})}))).status,401);
});

test('acknowledgement uses caller identity and server time, preserves metadata and is idempotent',async()=>{
 let savedUser={id:member.id,app_metadata:{provider:'google'}};let writes=0;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json(savedUser);
  assert.equal(url,'https://test.supabase.co/auth/v1/admin/users/'+member.id);assert.equal(options.method,'PUT');
  const payload=JSON.parse(options.body);writes++;assert.equal(payload.app_metadata.provider,'google');
  savedUser={...savedUser,...payload};return Response.json(savedUser);
 };
 const before=Date.now();
 const response=await request('/api/me','POST',{adultTermsAccepted:true,id:'victim',acceptedAt:'1900-01-01',app_metadata:{role:'admin'}});
 assert.equal(response.status,200);const result=await response.json();
 assert.ok(Date.parse(result.acceptedAt)>=before&&Date.parse(result.acceptedAt)<=Date.now());
 assert.equal(savedUser.app_metadata.role,undefined);
 const again=await (await request('/api/me','POST',{adultTermsAccepted:true})).json();
 assert.equal(again.acceptedAt,result.acceptedAt);assert.equal(writes,1);
 const own=await (await request('/api/me')).json();assert.equal(own.adultTermsAccepted,true);
});

test('failed Auth admin acknowledgement is not reported as saved',async()=>{
 globalThis.fetch=async url=>url.endsWith('/auth/v1/user')?Response.json({id:member.id}):Response.json({error:'Unavailable'},{status:503});
 const response=await request('/api/me','POST',{adultTermsAccepted:true});assert.equal(response.status,500);
 assert.notEqual((await response.json()).adultTermsAccepted,true);
});

test('received-like profiles require an active Plus subscription before discovery is queried',async()=>{
 const response=await request('/api/discover?intention=play&likes=1');assert.equal(response.status,403);
 assert.ok(!calls.some(c=>c.sql.includes('JOIN public.profiles v')));
 const entitlement=calls.find(c=>c.sql.includes('public.subscriptions'));
 assert.ok(entitlement.sql.includes('public.pacemate_plus_entitled(subscriptions)'));
});

test('active Plus can add a validated future city; the server enforces the five-city limit',async()=>{
 let count=0;
 sqlHandler=async sql=>{
  if(sql.includes('public.subscriptions'))return [{active:true}];
  if(sql.includes('count(*)::int AS n'))return [{n:count}];
  return [];
 };
 const arrival=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 assert.equal((await request('/api/trips','POST',{city:'Lisbon',arrival})).status,201);
 const insert=calls.find(c=>c.sql.startsWith('INSERT INTO public.travel_plans'));
 assert.deepEqual(insert.params,[member.id,'Lisbon',arrival,null]);
 count=5;calls=[];
 assert.equal((await request('/api/trips','POST',{city:'Paris',arrival})).status,422);
 assert.ok(!calls.some(c=>c.sql.startsWith('INSERT INTO public.travel_plans')));
});

test('free members can still send likes without a Plus entitlement',async()=>{
 sqlHandler=async sql=>sql.includes('feature_limits')?[{hits:1}]:sql.startsWith('SELECT p.* FROM public.profiles p JOIN public.profiles v')?[{...member,id:'member-b'}]:[];
 assert.equal((await request('/api/swipes','POST',{targetId:'member-b',liked:true,intention:'play'})).status,200);
 assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO public.swipes')));
 assert.ok(!calls.some(c=>c.sql.includes('public.subscriptions')));
});

test('the five-city Plus cap includes an upcoming primary trip from the free profile path',async()=>{
 profile.nextCity='Paris';profile.nextArrival=new Date(Date.now()+86400000).toISOString().slice(0,10);
 sqlHandler=async sql=>sql.includes('public.subscriptions')?[{active:true}]:sql.includes('count(*)::int AS n')?[{n:4}]:[];
 const response=await request('/api/trips','POST',{city:'Lisbon',arrival:profile.nextArrival});assert.equal(response.status,422);assert.ok(!calls.some(c=>c.sql.startsWith('INSERT INTO public.travel_plans')));
});

test('confirming a destination changes profile geography without changing billing preferences',async()=>{
 const arrival=new Date().toISOString().slice(0,10);
 sqlHandler=async sql=>sql.startsWith('SELECT city,arrival,country_code')?[{city:'Lisbon',arrival,country_code:'PT'}]:[];
 assert.equal((await request('/api/trips/arrive','POST',{tripId:'trip-a'})).status,200);
 const update=calls.find(c=>c.sql.startsWith('UPDATE public.profiles SET current_city'));
 assert.equal(update.params[3],'PT');assert.equal(update.params[4],'Portugal');
 assert.ok(!calls.some(c=>c.sql.includes('billing_preferences')||c.sql.includes('UPDATE public.subscriptions')));
});

test('destination discovery excludes temporary test perks when test access is disabled',async()=>{
 sqlHandler=async sql=>sql.includes('WHERE p.id=$1')?[foundationData]:[];
 const response=await request('/api/discover?intention=play');assert.equal(response.status,200);
 const query=calls.find(c=>c.sql.includes('JOIN public.profiles v'));
 assert.ok(query);assert.equal(query.params[16],'{}');
 assert.equal(query.sql.split("sub.provider<>'test' OR sub.user_id=ANY($17::text[])").length-1,3);
});

test('received-like count does not disappear after the receiver likes or passes back',async()=>{
 sqlHandler=async sql=>sql.includes('AS "likesYou"')?[{unread:0,likesYou:1}]:[];
 const response=await request('/api/today/badges');assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{unread:0,likesYou:1});
 const query=calls.find(c=>c.sql.includes('AS "likesYou"'));
 assert.deepEqual(query.params,[member.id]);assert.ok(!query.sql.includes('s2'));
 assert.ok(!query.sql.includes('NOT EXISTS (SELECT 1 FROM public.swipes'));
 assert.match(query.sql,/NOT p.paused AND NOT p.suspended/);assert.match(query.sql,/public.blocks/);
 assert.ok(!query.sql.includes('p.*'));assert.ok(!query.sql.includes('photos'));
});
test('Plus received-like mode includes already answered incoming likes; ordinary Discover still excludes answered profiles',async()=>{
 sqlHandler=async sql=>sql.includes('public.subscriptions')?[{active:true}]:sql.includes('WHERE p.id=$1')?[foundationData]:[];
 assert.equal((await request('/api/discover?intention=play&likes=1')).status,200);
 const query=calls.find(c=>c.sql.includes('JOIN public.profiles v'));
 assert.match(query.sql,/AND\(\$7 OR NOT EXISTS\(SELECT 1 FROM public.swipes/);assert.equal(query.params[6],true);
 calls=[];assert.equal((await request('/api/discover?intention=play')).status,200);
 assert.equal(calls.find(c=>c.sql.includes('JOIN public.profiles v')).params[6],false);
});

test('two free accounts liking each other create one match and retain one received like each',async()=>{
 const swipes=new Map(),matches=new Map();
 globalThis.fetch=async url=>{assert.ok(url.endsWith('/auth/v1/user'));return Response.json({id:profile.id,email:'fixture@example.test',app_metadata:{pacemate_adult_terms_accepted_at:'2026-11-08T00:00:00Z'}});};
 sqlHandler=async(sql,params=[])=>{
  if(sql.includes('feature_limits'))return [{hits:1}];
  if(sql.startsWith('SELECT p.* FROM public.profiles p JOIN'))return [{...member,id:params[1]}];
  if(sql.startsWith('INSERT INTO public.swipes')){swipes.set(params[0]+':'+params[1]+':'+params[2],{liked:params[3],acted_at:new Date().toISOString()});return [{acted_at:swipes.get(params[0]+':'+params[1]+':'+params[2]).acted_at}];}
  if(sql.startsWith('SELECT s.acted_at')){const s=swipes.get(params[0]+':'+params[1]+':'+params[2]);return s?.liked?[{acted_at:s.acted_at}]:[];}
  if(sql.includes('max(ended_at)'))return [{ended_at:null}];
  if(sql.startsWith('SELECT id FROM public.matches')&&sql.includes('ended_at IS NULL'))return [matches.get(params.join(':'))].filter(Boolean);
  if(sql.startsWith('INSERT INTO public.matches')){const record={id:22,user_a:params[0],user_b:params[1],intention:params[2]};matches.set(params.join(':'),record);return [record];}
  if(sql.includes('AS "likesYou"'))return [{unread:0,likesYou:[...swipes].filter(([key,value])=>value.liked&&key.split(':')[1]===params[0]).length}];
  return [];
 };
 profile={...member,id:'member-a'};
 const first=await request('/api/swipes','POST',{targetId:'member-b',liked:true,intention:'play'});assert.equal(first.status,200);assert.equal((await first.json()).match,null);
 profile={...member,id:'member-b'};
 const second=await request('/api/swipes','POST',{targetId:'member-a',liked:true,intention:'play'});assert.equal(second.status,200);assert.equal((await second.json()).match.id,22);
 assert.equal(matches.size,1);assert.equal(swipes.size,2);
 for(const id of ['member-a','member-b']){profile={...member,id};assert.equal((await(await request('/api/today/badges')).json()).likesYou,1);}
 assert.ok(!calls.some(c=>c.sql.includes('public.subscriptions')),'Mutual likes and matching must remain free');
});

test('the same pair can create independent Play, Friend, and Date matches',async()=>{
 const swipes=new Map(),matches=new Map();let nextId=100;
 globalThis.fetch=async url=>Response.json({id:profile.id,email:'fixture@example.test',app_metadata:{pacemate_adult_terms_accepted_at:'2026-11-08T00:00:00Z'}});
 sqlHandler=async(sql,params=[])=>{
  if(sql.includes('feature_limits'))return [{hits:1}];
  if(sql.startsWith('SELECT p.* FROM public.profiles p JOIN'))return [{...member,id:params[1]}];
  if(sql.startsWith('INSERT INTO public.swipes')){const key=params.slice(0,3).join(':');const swipe={liked:params[3],acted_at:new Date().toISOString()};swipes.set(key,swipe);return [{acted_at:swipe.acted_at}];}
  if(sql.startsWith('SELECT s.acted_at')){const swipe=swipes.get(params.join(':'));return swipe?.liked?[{acted_at:swipe.acted_at}]:[];}
  if(sql.includes('max(ended_at)'))return [{ended_at:null}];
  if(sql.startsWith('SELECT id FROM public.matches')&&sql.includes('ended_at IS NULL'))return [matches.get(params.join(':'))].filter(Boolean);
  if(sql.startsWith('INSERT INTO public.matches')){const match={id:nextId++,user_a:params[0],user_b:params[1],intention:params[2]};matches.set(params.join(':'),match);return [match];}
  return [];
 };
 for(const intention of ['play','friend','date']){
  profile={...member,id:'member-a'};
  assert.equal((await request('/api/swipes','POST',{targetId:'member-b',liked:true,intention})).status,200);
  profile={...member,id:'member-b'};
  const reciprocal=await request('/api/swipes','POST',{targetId:'member-a',liked:true,intention});
  assert.equal(reciprocal.status,200);const result=(await reciprocal.json()).match;assert.ok(result,`Expected reciprocal ${intention} likes to match`);assert.equal(result.intention,intention);
 }
 assert.equal(matches.size,3);assert.deepEqual([...matches.values()].map(m=>m.intention),['play','friend','date']);
});

test('a Play like and a Friend like never form a reciprocal match',async()=>{
 const swipes=new Map();let matchInserts=0;
 globalThis.fetch=async url=>Response.json({id:profile.id,email:'fixture@example.test',app_metadata:{pacemate_adult_terms_accepted_at:'2026-11-08T00:00:00Z'}});
 sqlHandler=async(sql,params=[])=>{
  if(sql.includes('feature_limits'))return [{hits:1}];
  if(sql.startsWith('SELECT p.* FROM public.profiles p JOIN'))return [{...member,id:params[1]}];
  if(sql.startsWith('INSERT INTO public.swipes')){const key=params.slice(0,3).join(':');swipes.set(key,{liked:params[3],acted_at:new Date().toISOString()});return [{acted_at:swipes.get(key).acted_at}];}
  if(sql.startsWith('SELECT s.acted_at')){const swipe=swipes.get(params.join(':'));return swipe?.liked?[{acted_at:swipe.acted_at}]:[];}
  if(sql.includes('max(ended_at)'))return [{ended_at:null}];
  if(sql.startsWith('INSERT INTO public.matches')){matchInserts++;return [{id:201}];}
  return [];
 };
 profile={...member,id:'member-a'};assert.equal((await request('/api/swipes','POST',{targetId:'member-b',liked:true,intention:'play'})).status,200);
 profile={...member,id:'member-b'};assert.equal((await request('/api/swipes','POST',{targetId:'member-a',liked:true,intention:'friend'})).status,200);
 assert.equal(matchInserts,0);
});

test('new swipe creation rejects missing, null, or unknown intention',async()=>{
 sqlHandler=async sql=>sql.includes('feature_limits')?[{hits:1}]:[];
 for(const intention of [undefined,null,'dating']){
  const payload={targetId:'member-b',liked:true};if(intention!==undefined)payload.intention=intention;
  assert.equal((await request('/api/swipes','POST',payload)).status,422);
 }
 assert.ok(!calls.some(c=>c.sql.startsWith('INSERT INTO public.swipes')));
});

test('blocked-pair handling closes matches without deleting chat or mutating swipe history',async()=>{
 let blockInserted=false;
 sqlHandler=async(sql)=>{
  if(sql.includes('feature_limits'))return [{hits:1}];
  if(sql.includes('SELECT id FROM public.profiles'))return [{id:'member-b'}];
  return [];
 };
 globalThis.__communityExecute=async query=>{calls.push({sql:JSON.stringify(query.queryChunks||query)});return [];};
 globalThis.__communityInsert=()=>({values:()=>({onConflictDoNothing:async()=>{blockInserted=true;}})});
 const response=await request('/api/block','POST',{userId:'member-b'});
 assert.equal(response.status,200);assert.equal(blockInserted,true);
 assert.equal(calls.length,2);assert.match(calls[1].sql,/UPDATE public\.matches SET ended_at/);
 assert.doesNotMatch(calls[1].sql,/DELETE FROM public\.(matches|conversations|messages)|UPDATE swipes SET liked=false/i);
 delete globalThis.__communityInsert;delete globalThis.__communityExecute;
});

test('archived conversations remain readable but reject message, reaction, receipt, and attachment writes',async()=>{
 const archived={id:22,user_a:member.id,user_b:'member-b',other_id:'member-b',intention:'play',ended_at:'2026-11-10T10:00:00Z'};
 sqlHandler=async(sql,params=[])=>{
  if(sql.startsWith('SELECT m.*,CASE'))return params[2]==='read'?[archived]:[];
  if(sql.includes('public.messages m LEFT JOIN'))return [{id:7,match_id:22,sender_id:'member-b',body:'Saved history',created_at:'2026-11-10T09:00:00Z'}];
  if(sql.includes('SELECT last_read_id'))return [{last_read_id:0}];
  if(sql.startsWith('SELECT * FROM public.profiles'))return [{...member,id:'member-b'}];
  if(sql.includes('feature_limits'))return [{hits:1}];
  return [];
 };
 const history=await request('/api/matches/22/messages');assert.equal(history.status,200);assert.equal((await history.json()).messages[0].body,'Saved history');
 assert.equal((await request('/api/matches/22/messages','POST',{body:'New contact'})).status,404);
 assert.equal((await request('/api/matches/22/messages','PUT',{lastReadId:7})).status,409);
 assert.equal((await request('/api/matches/22/chat','POST',{action:'reaction',messageId:7,emoji:'👍'})).status,404);
 assert.equal((await request('/api/matches/22/attachments','POST',{})).status,404);
 assert.ok(!calls.some(c=>c.sql.startsWith('INSERT INTO public.messages')||c.sql.startsWith('INSERT INTO public.message_reactions')||c.sql.startsWith('INSERT INTO public.chat_attachments')));
});

test('a blocked participant cannot retrieve even an archived conversation',async()=>{
 sqlHandler=async sql=>sql.startsWith('SELECT m.*,CASE')?[]:[];
 assert.equal((await request('/api/matches/22/messages')).status,404);
 assert.equal((await request('/api/matches/22/chat')).status,404);
});

test('reaction and mute writes recheck the active unblocked match under the pair lock',async()=>{
 const active={id:22,user_a:member.id,user_b:'member-b',other_id:'member-b',ended_at:null};
 sqlHandler=async(sql,params=[])=>{
  if(sql.includes('SELECT m.*,CASE'))return [active];
  if(sql.startsWith('SELECT 1 FROM public.matches m'))return [{}];
  if(sql.startsWith('SELECT id FROM public.messages'))return [{id:7}];
  if(sql.startsWith('SELECT emoji'))return [];
  return [];
 };
 assert.equal((await request('/api/matches/22/chat','POST',{action:'reaction',messageId:7,emoji:'👍'})).status,200);
 assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO public.message_reactions')));
 calls=[];
 assert.equal((await request('/api/matches/22/chat','POST',{action:'mute',muted:true})).status,200);
 assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO public.conversation_members')));
 calls=[];
 sqlHandler=async(sql)=>sql.includes('SELECT m.*,CASE')?[active]:sql.startsWith('SELECT 1 FROM public.matches m')?[]:[];
 assert.equal((await request('/api/matches/22/chat','POST',{action:'reaction',messageId:7,emoji:'👍'})).status,404);
 assert.ok(!calls.some(c=>c.sql.startsWith('INSERT INTO public.message_reactions')));
});

test('unmatching closes only the selected intention-specific match and preserves records',async()=>{
 const active={id:42,user_a:member.id,user_b:'member-b',other_id:'member-b',intention:'friend',ended_at:null};
 sqlHandler=async(sql,params=[])=>{
  if(sql.startsWith('SELECT m.*,CASE'))return [active];
  if(sql.startsWith('UPDATE public.matches SET ended_at')){assert.deepEqual(params,[42,member.id]);return [{id:42}];}
  return [];
 };
 assert.equal((await request('/api/matches/42','DELETE')).status,200);
 const end=calls.find(c=>c.sql.startsWith('UPDATE public.matches SET ended_at'));
 assert.ok(end.sql.includes('WHERE id=$1')&&end.sql.includes('ended_at IS NULL'));
 assert.ok(!calls.some(c=>/DELETE FROM public\.(matches|conversations|messages)|UPDATE public\.swipes/i.test(c.sql)));
});

test('both participants must like again after an intention-specific match closes',async()=>{
 const closedAt=new Date(Date.now()-1000).toISOString(),swipes=new Map();let matchInsertCount=0;
 globalThis.fetch=async url=>Response.json({id:profile.id,email:'fixture@example.test',app_metadata:{pacemate_adult_terms_accepted_at:'2026-11-08T00:00:00Z'}});
 sqlHandler=async(sql,params=[])=>{
  if(sql.includes('feature_limits'))return [{hits:1}];
  if(sql.startsWith('SELECT p.* FROM public.profiles p JOIN'))return [{...member,id:params[1]}];
  if(sql.startsWith('INSERT INTO public.swipes')){const key=params.slice(0,3).join(':');const value={liked:params[3],acted_at:new Date().toISOString()};swipes.set(key,value);return [{acted_at:value.acted_at}];}
  if(sql.startsWith('SELECT s.acted_at')){const value=swipes.get(params.join(':'));return value?.liked?[{acted_at:value.acted_at}]:[];}
  if(sql.includes('max(ended_at)'))return [{ended_at:closedAt}];
  if(sql.startsWith('INSERT INTO public.matches')){matchInsertCount++;return [{id:300}];}
  return [];
 };
 const oldLike=new Date(Date.parse(closedAt)-5000).toISOString();
 swipes.set('member-a:member-b:play',{liked:true,acted_at:oldLike});
 swipes.set('member-b:member-a:play',{liked:true,acted_at:oldLike});
 profile={...member,id:'member-a'};
 const first=await request('/api/swipes','POST',{targetId:'member-b',liked:true,intention:'play'});
 assert.equal((await first.json()).match,null);assert.equal(matchInsertCount,0);
 profile={...member,id:'member-b'};
 const second=await request('/api/swipes','POST',{targetId:'member-a',liked:true,intention:'play'});
 assert.equal((await second.json()).match.id,300);assert.equal(matchInsertCount,1);
});

test('Free members can save, view, replace and clear their primary destination without Plus',async()=>{
 let primary=null,count=0;
 sqlHandler=async(sql,params)=>{
  if(sql.startsWith('SELECT id,next_city,next_arrival'))return [{id:member.id,next_city:primary?.city,next_arrival:primary?.arrival}];
  if(sql.includes('count(*)::int AS n'))return [{n:count}];
  if(sql.startsWith('UPDATE public.profiles SET next_city=$2')){primary={city:params[1],arrival:params[2]};profile.nextCity=primary.city;profile.nextArrival=primary.arrival;}
  if(sql.startsWith('UPDATE public.profiles SET next_city=NULL')){primary=null;profile.nextCity=null;profile.nextArrival=null;}
  return [];
 };
 const arrival=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 assert.equal((await request('/api/trips/primary','PUT',{city:'Lisbon',arrival})).status,200);
 const list=await(await request('/api/trips')).json();assert.equal(list.plans[0].primary,true);assert.equal(list.upcomingCount,1);assert.equal(list.plus,false);
 assert.equal((await request('/api/trips/primary','PUT',{city:'Paris',arrival})).status,200);assert.equal(primary.city,'Paris');
 assert.equal((await request('/api/trips','POST',{city:'Berlin',arrival})).status,403);
 assert.equal((await request('/api/trips/dismiss','POST',{})).status,200);assert.equal(primary,null);
});
test('downgraded members cannot add a primary destination while other upcoming destinations remain',async()=>{
 sqlHandler=async sql=>sql.startsWith('SELECT id,next_city,next_arrival')?[{id:member.id}]:sql.includes('count(*)::int AS n')?[{n:2}]:[];
 const arrival=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 assert.equal((await request('/api/trips/primary','PUT',{city:'Lisbon',arrival})).status,422);
 assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE public.profiles')));assert.ok(!calls.some(c=>c.sql.startsWith('DELETE')));
});
test('primary destination validates date and city, uses authenticated ownership and locks the profile',async()=>{
 const arrival=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 sqlHandler=async sql=>sql.includes('count(*)::int AS n')?[{n:0}]:[];
 assert.equal((await request('/api/trips/primary','PUT',{city:'Lisbon',arrival:'invalid'})).status,422);
 assert.equal((await request('/api/trips/primary','PUT',{city:'Lisbon',arrival,userId:'victim'})).status,200);
 assert.deepEqual(calls.find(c=>c.sql.includes('FOR UPDATE')).params,[member.id]);
 assert.equal(calls.find(c=>c.sql.startsWith('UPDATE public.profiles SET next_city=$2')).params[0],member.id);
});

test('empty Discover results do not issue an unnecessary second profile query',async()=>{
 const response=await request('/api/discover?intention=play');assert.equal(response.status,200);assert.deepEqual((await response.json()).people,[]);
 assert.ok(!calls.some(c=>c.sql.includes('WHERE p.id=$1')));
});

test('phone push registration persists the authenticated owner and enables match/message delivery',async()=>{
 const endpoint='https://fcm.googleapis.com/push/device';
 env.VAPID_PUBLIC_KEY='fixture';env.VAPID_PRIVATE_KEY='fixture';
 try{
  sqlHandler=async(sql,params)=>sql.includes('count(*)::int AS n')?[{n:0}]:sql.startsWith('INSERT INTO public.push_subscriptions')?[{user_id:params[0]}]:sql.includes('feature_limits')?[{hits:1}]:[];
  assert.equal((await request('/api/notifications/push','POST',{user_id:'victim',endpoint,keys:{p256dh:'A'.repeat(86),auth:'B'.repeat(22)}})).status,200);
  const insert=calls.find(c=>c.sql.startsWith('INSERT INTO public.push_subscriptions'));assert.equal(insert.params[0],member.id);assert.match(insert.sql,/WHERE push_subscriptions.user_id=EXCLUDED.user_id/);
  assert.ok(calls.some(c=>c.sql.includes('push_enabled=true')));
 }finally{delete env.VAPID_PUBLIC_KEY;delete env.VAPID_PRIVATE_KEY;}
});
test('subscription status and deletion are scoped to the authenticated device owner',async()=>{
 sqlHandler=async sql=>sql.startsWith('SELECT 1 FROM public.push_subscriptions')?[{one:1}]:sql.startsWith('SELECT push_enabled')?[{push_enabled:true}]:[];
 const endpoint='https://fcm.googleapis.com/push/device';
 const status=await request('/api/notifications/push?endpoint='+encodeURIComponent(endpoint));assert.equal(status.status,200);assert.equal((await status.json()).enabled,true);
 assert.equal((await request('/api/notifications/push','DELETE',{endpoint})).status,200);
 const removal=calls.find(c=>c.sql.startsWith('DELETE FROM public.push_subscriptions'));assert.deepEqual(removal.params,[member.id,endpoint]);
});

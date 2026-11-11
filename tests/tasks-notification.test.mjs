import test from 'node:test';
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';

const f=globalThis.__taskEmail={};
const env={RESEND_API_KEY:'fixture-resend',PACEMATE_EMAIL_FROM:'PaceMate <test@example.test>',PACEMATE_APP_URL:'https://app.example.test'};
globalThis.Deno={env:{get:key=>env[key]}};
const bundle=await rolldown({
 input:'supabase/functions/pacemate/handlers/tasks.ts',
 plugins:[{
  name:'task-email-fixtures',
  resolveId(id){
   if(id==='../server/http.ts')return '\0task-http';
   if(id==='../server/feature-db.ts')return '\0task-db';
   if(id==='../server/validation.js')return '\0task-validation';
   if(id==='../server/push-delivery.ts')return '\0task-push';
   if(id==='../server/supabase.ts')return '\0task-storage';
  },
  load(id){
   if(id==='\0task-http')return 'export const json=(body,status=200)=>Response.json(body,{status});export class HttpError extends Error{}';
   if(id==='\0task-db')return 'export const rows=(...args)=>globalThis.__taskEmail.rows(...args);export const transaction=fn=>fn({unsafe:(...args)=>globalThis.__taskEmail.unsafe(...args)});export const rateLimit=async()=>{};';
   if(id==='\0task-validation')return 'export const internalHref=href=>href;';
   if(id==='\0task-push')return 'export const deliverPushNotification=async()=>"skipped";';
   if(id==='\0task-storage')return 'export const deletePrivate=async()=>{};';
  },
 }],
});
const output=await bundle.generate({format:'esm',codeSplitting:false});
await bundle.close();
const {deliverEmailNotification}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
const originalFetch=globalThis.fetch;
const notice=(kind='match')=>({
 id:88,user_id:'recipient',kind,
 dedupe_key:kind==='match'?'match:22:recipient':'message:123',
 email:'recipient@example.test',email_confirmed_at:'2026-11-01T00:00:00Z',
 email_matches:true,email_messages:true,unsubscribe_token:'token',
 title:kind==='match'?'New match':'New message',body:'Notification body',
 href:'/app/matches/22',email_state:'pending',email_attempts:0,read_at:null,
});

test.beforeEach(()=>{
 env.RESEND_API_KEY='fixture-resend';env.PACEMATE_EMAIL_FROM='PaceMate <test@example.test>';
 f.calls=[];f.requests=[];f.matchExists=true;f.active=true;f.blocked=false;f.suspended=false;
 f.preference=true;f.notificationPending=true;f.notificationRead=false;
 f.messageExists=true;f.messageUnread=true;f.muted=false;
 f.unsafe=async(sql,params=[])=>{
  f.calls.push({sql,params});
  if(sql.startsWith('SELECT user_a,user_b FROM public.matches'))return f.matchExists?[{user_a:'member-a',user_b:'recipient'}]:[];
  if(sql.includes('JOIN public.matches m ON m.id=msg.match_id WHERE msg.id=$1'))return f.messageExists?[{id:22,user_a:'member-a',user_b:'recipient'}]:[];
  if(sql.includes('pg_advisory_xact_lock'))return [];
  if(sql.includes('FROM public.notifications notice')){
   const isMessage=sql.includes('JOIN public.messages msg');
   const eligible=f.matchExists&&f.active&&!f.blocked&&!f.suspended&&f.preference&&f.notificationPending&&!f.notificationRead;
   return eligible&&(!isMessage||(f.messageExists&&f.messageUnread&&!f.muted))?[{one:1}]:[];
  }
  return [];
 };
 globalThis.fetch=async(url,options)=>{f.requests.push({url,options});return new Response(null,{status:202});};
});
test.afterEach(()=>{globalThis.fetch=originalFetch;});

test('claimed match emails are suppressed after unmatching',async()=>{
 f.active=false;
 assert.equal(await deliverEmailNotification(notice('match')),'skipped');
 assert.equal(f.requests.length,0);
});
test('claimed match emails are suppressed after either participant blocks',async()=>{
 f.blocked=true;
 assert.equal(await deliverEmailNotification(notice('match')),'skipped');
 assert.equal(f.requests.length,0);
 const query=f.calls.find(call=>call.sql.includes('FROM public.notifications notice')).sql;
 assert.match(query,/m\.ended_at IS NULL/);assert.match(query,/public\.blocks/);assert.match(query,/NOT a\.suspended AND NOT b\.suspended/);
});
test('claimed message emails are suppressed after unmatching',async()=>{
 f.active=false;
 assert.equal(await deliverEmailNotification(notice('message')),'skipped');
 assert.equal(f.requests.length,0);
});
test('claimed message emails are suppressed after a block',async()=>{
 f.blocked=true;
 assert.equal(await deliverEmailNotification(notice('message')),'skipped');
 assert.equal(f.requests.length,0);
});
test('read or muted message notifications are skipped before provider delivery',async()=>{
 f.messageUnread=false;
 assert.equal(await deliverEmailNotification(notice('message')),'skipped');
 f.messageUnread=true;f.muted=true;
 assert.equal(await deliverEmailNotification(notice('message')),'skipped');
 assert.equal(f.requests.length,0);
 const query=f.calls.find(call=>call.sql.includes('JOIN public.messages msg')).sql;
 assert.match(query,/msg\.read_at IS NULL/);assert.match(query,/muted_until>now\(\)/);assert.match(query,/settings\.email_messages/);
});
test('eligible active-match emails still send and preserve provider retry errors',async()=>{
 assert.equal(await deliverEmailNotification(notice('match')),'sent');
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'https://api.resend.com/emails');
 assert.equal(await deliverEmailNotification(notice('message')),'sent');assert.equal(f.requests.length,2);
 globalThis.fetch=async()=>new Response(null,{status:503});
 await assert.rejects(deliverEmailNotification(notice('match')),/EMAIL_PROVIDER_503/);
});
test('social notification checks do not suppress unrelated email notification types',async()=>{
 f.matchExists=false;f.preference=false;
 assert.equal(await deliverEmailNotification({...notice('streak'),email_streaks:true}), 'sent');
 assert.equal(f.requests.length,1);assert.equal(f.calls.length,0);
});

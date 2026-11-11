import test from 'node:test';
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';
const f=globalThis.__notificationApi={};
const bundle=await rolldown({input:'supabase/functions/pacemate/handlers/notifications.ts',plugins:[{name:'notification-fixtures',resolveId(id){if(id.endsWith('/http.ts'))return '\0http';if(id.endsWith('/feature-db.ts'))return '\0db';if(id.endsWith('/push-delivery.ts'))return '\0push';},load(id){
 if(id==='\0http')return `export const handle=f=>f,json=Response.json,body=req=>req.json();export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}export const requireProfile=async()=>{if(!globalThis.__notificationApi.user)throw new HttpError(401,'Sign in');return {user:{id:globalThis.__notificationApi.user}};};`;
 if(id==='\0db')return `export const rows=(...args)=>globalThis.__notificationApi.rows(...args),rateLimit=(...args)=>globalThis.__notificationApi.limits.push(args);`;
 if(id==='\0push')return `export const deliverPushNotification=async n=>{globalThis.__notificationApi.sent.push(n);return globalThis.__notificationApi.state;};`;
 }}]});
const output=await bundle.generate({format:'esm'});await bundle.close();const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
const request=(method,body)=>new Request('https://example.test/api/notifications/test',{method,...(body?{body:JSON.stringify(body)}:{})});
test.beforeEach(()=>{f.user='recipient';f.state='sent';f.enabled=true;f.sent=[];f.limits=[];f.queries=[];f.rows=async(sql,args)=>{f.queries.push({sql,args});if(sql.startsWith('SELECT count(*)'))return [{unread:0}];if(sql.startsWith('SELECT id,kind'))return [];return [{push_enabled:f.enabled}];};});
test('test pushes use only the authenticated owner and are rate limited',async()=>{
 const response=await handler(request('POST',{userId:'someone-else'}),{params:{action:'test'}});
 assert.equal(response.status,200);assert.equal(f.sent[0].user_id,'recipient');assert.deepEqual(f.limits[0],['recipient','push-test',3,60]);assert.deepEqual(f.queries[0].args,['recipient']);
});
test('test push requires login, POST and enabled preferences',async()=>{
 f.user=null;await assert.rejects(handler(request('POST'),{params:{action:'test'}}),e=>e.status===401);
 f.user='recipient';await assert.rejects(handler(request('GET'),{params:{action:'test'}}),e=>e.status===405);
 f.enabled=false;await assert.rejects(handler(request('POST'),{params:{action:'test'}}),e=>e.status===409);assert.equal(f.sent.length,0);
});
test('test push reports missing configuration or subscriptions instead of a false success',async()=>{
 for(const state of ['unconfigured','skipped']){f.state=state;await assert.rejects(handler(request('POST'),{params:{action:'test'}}),e=>e.status===409);}
});
test('chat acknowledgements clear only the owner’s already-read message notifications',async()=>{
 await handler(request('PUT',{matchId:12}),{params:{}});const query=f.queries[0];
 assert.deepEqual(query.args,['recipient','/app/matches/12',12]);assert.match(query.sql,/n.user_id=\$1/);assert.match(query.sql,/m.read_at IS NOT NULL/);assert.match(query.sql,/n.kind='message'/);
});
test('closed or blocked social notifications are hidden from the inbox and unread badge',async()=>{
 const req=new Request('https://example.test/api/notifications');
 await handler(req,{params:{}});
 const list=f.queries.find(q=>q.sql.startsWith('SELECT id,kind'));
 const badge=f.queries.find(q=>q.sql.startsWith('SELECT count(*)'));
 for(const query of [list,badge]){assert.match(query.sql,/n.kind NOT IN \('match','message'\)/);assert.match(query.sql,/m.ended_at IS NULL/);assert.match(query.sql,/public.blocks/);}
});

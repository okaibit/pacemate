import test from 'node:test';
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';
const f=globalThis.__messageReplies={};
const bundle=await rolldown({input:'supabase/functions/pacemate/handlers/messages.ts',plugins:[{name:'reply-fixtures',resolveId(id){for(const name of ['http.ts','feature-db.ts','push-delivery.ts','supabase.ts'])if(id.endsWith('/'+name))return '\0'+name;},load(id){
 if(id==='\0http.ts')return `export const handle=f=>f,json=(data,status=200)=>Response.json(data,{status}),body=req=>req.json(),str=(v,max)=>typeof v==='string'?v.slice(0,max):'',publicProfile=v=>v;export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}`;
 if(id==='\0feature-db.ts')return `export const rows=(...args)=>globalThis.__messageReplies.rows(...args),transaction=fn=>fn({unsafe:(...args)=>globalThis.__messageReplies.rows(...args)}),lockActiveMatch=async(tx)=>{if(!(await tx.unsafe('SELECT 1 FROM public.matches')).length)throw Error('closed');},rateLimit=async()=>{},camel=v=>v,requireMatch=async()=>({user:{id:'me'},match:{user_a:'me',user_b:'other'}});`;
 if(id==='\0push-delivery.ts')return `export const queueSocialPush=key=>globalThis.__messageReplies.pushes.push(key);`;
 if(id==='\0supabase.ts')return `export const signedPhoto=async()=>'';`;
 }}]});
const out=await bundle.generate({format:'esm'});await bundle.close();const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(out.output[0].code).toString('base64'));
const send=body=>handler(new Request('https://test/api/matches/12/messages',{method:'POST',body:JSON.stringify(body)}),{params:{id:'12'}});
test.beforeEach(()=>{f.enabled=true;f.original=true;f.existing=false;f.queries=[];f.pushes=[];f.rows=async(sql,args=[])=>{
 f.queries.push({sql,args});if(sql.includes('information_schema.columns'))return [{enabled:f.enabled?'1':'0'}];
 if(sql.startsWith('SELECT 1 FROM public.matches'))return [{one:1}];if(sql.startsWith('SELECT * FROM public.messages'))return f.existing?[{id:100,match_id:12,body:'Answer',created_at:'2026-11-09'}]:[];
 if(sql.startsWith('SELECT id FROM public.messages WHERE id='))return f.original?[{id:7}]:[];
 if(sql.startsWith('INSERT INTO public.messages'))return [{id:100,match_id:12,body:'Answer',created_at:'2026-11-09'}];
 if(sql.includes('original.sender_id'))return f.enabled?[{message_id:100,id:7,sender_id:'other',body:'Original',type:'text'}]:[];
 return [];
 };});
test('reply validates the original belongs to this chat and persists its ID before queuing push',async()=>{
 const result=await (await send({body:'Answer',replyToId:7})).json();assert.equal(result.message.reply.id,7);
 assert.deepEqual(f.queries.find(q=>q.sql.startsWith('SELECT id FROM public.messages WHERE id=')).args,[7,12]);
 assert.deepEqual(f.queries.find(q=>q.sql.startsWith('UPDATE public.messages SET reply_to_id')).args,[100,7]);assert.deepEqual(f.pushes,['message:100']);
 const quote=f.queries.find(q=>q.sql.includes('original.sender_id'));assert.match(quote.sql,/original.match_id=m.match_id/);assert.equal(quote.args[0],12);
});
test('cross-chat or missing originals and malformed IDs are rejected before saving',async()=>{
 f.original=false;await assert.rejects(send({body:'Answer',replyToId:7}),e=>e.status===422);
 for(const value of ['7',-1,1.2])await assert.rejects(send({body:'Answer',replyToId:value}),e=>e.status===422);
 assert.ok(!f.queries.some(q=>q.sql.startsWith('INSERT INTO public.messages')));
});
test('ordinary messages work before the additive migration; replies fail without losing context',async()=>{
 f.enabled=false;await assert.rejects(send({body:'Answer',replyToId:7}),e=>e.status===409);
 const response=await send({body:'Answer'});assert.equal(response.status,201);assert.ok(!f.queries.some(q=>q.sql.startsWith('UPDATE public.messages SET reply_to_id')));
});
test('retrying an existing client identity does not insert another message or change its reply target',async()=>{
 f.existing=true;await send({body:'Answer',replyToId:7,clientId:'12345678-1234-1234-1234-123456789abc'});
 assert.ok(!f.queries.some(q=>q.sql.startsWith('INSERT INTO public.messages')||q.sql.startsWith('UPDATE public.messages SET reply_to_id')));
});

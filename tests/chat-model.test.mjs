import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMessages,safeLink,firstLink,sameGroup} from '../src/composables/chat-model.js';
import {publicLink,cleanPreview,fetchPreview} from '../supabase/functions/pacemate/server/link-preview.js';
test('realtime arriving before HTTP reconciliation leaves one sent bubble',()=>{
 const local={id:'local:1',client_id:'nonce',created_at:'2026-11-07T08:00:00Z',status:'sending',imageUrl:'blob:local'};
 const stored={id:12,client_id:'nonce',created_at:local.created_at,status:'sent'};
 let list=mergeMessages([local],[stored]);list=mergeMessages(list,[stored]);
 assert.equal(list.length,1);assert.equal(list[0].id,12);assert.equal(list[0].status,'sent');assert.equal(list[0].imageUrl,'blob:local');
});
test('receipt updates do not duplicate bubbles or erase loaded reactions',()=>{
 const list=mergeMessages([{id:1,created_at:'2026-11-07',reactions:[{emoji:'👍'}]}],[{id:1,created_at:'2026-11-07',read_at:'2026-11-07T09:00:00Z'}]);
 assert.equal(list.length,1);assert.equal(list[0].reactions[0].emoji,'👍');assert.ok(list[0].read_at);
});
test('groups stop at sender changes, five minutes and local date boundaries',()=>{
 const a={sender_id:'a',created_at:'2026-11-07T12:00:00Z'};
 assert.ok(sameGroup(a,{...a,created_at:'2026-11-07T12:03:00Z'}));
 assert.ok(!sameGroup(a,{...a,sender_id:'b'}));assert.ok(!sameGroup(a,{...a,created_at:'2026-11-07T12:06:00Z'}));
 assert.ok(!sameGroup(null,a));
});
test('rendered links reject active schemes and credentials',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,hello','https://user:secret@example.com'])assert.equal(safeLink(url),'');
 assert.equal(firstLink('Try https://example.com/watch?v=1.'),'https://example.com/watch?v=1');
});
test('preview requests reject local networks, auth links and non-HTTPS inputs',()=>{
 for(const url of ['http://example.com','https://127.0.0.1','https://2130706433','https://[::1]','https://service.internal/path','https://localhost','https://foo.localhost','https://app.supabase.co/a','https://example.com?access_token=private','https://example.com:444/a','https://user:pass@example.com','https://example.com/#token'])assert.equal(publicLink(url),null,url);
 assert.equal(publicLink('https://example.com/article'),'https://example.com/article');
});
test('preview metadata is bounded plain data with safe media URLs',()=>{
 const data=cleanPreview({title:'x'.repeat(400),description:'y'.repeat(500),image:{url:'javascript:alert(1)'},logo:{url:'https://example.com/logo.png'},video:{duration:125}},'https://example.com');
 assert.equal(data.title.length,200);assert.equal(data.description.length,350);assert.equal(data.image,null);assert.equal(data.duration,'2:05');assert.equal(data.logo,'https://example.com/logo.png');
});
test('Edge preview fetch calls only the fixed provider, never the supplied destination',async()=>{
 const original=globalThis.fetch;const oldDeno=globalThis.Deno;const calls=[];
 globalThis.Deno={env:{get:()=>undefined}};globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({status:'success',data:{title:'Example',image:{url:'https://example.com/image.jpg'}}});};
 try{const result=await fetchPreview('https://example.com/article');assert.equal(result.title,'Example');assert.equal(calls.length,1);assert.equal(new URL(calls[0].url).origin,'https://api.microlink.io');assert.equal(calls[0].options.redirect,'error');}finally{globalThis.fetch=original;globalThis.Deno=oldDeno;}
});

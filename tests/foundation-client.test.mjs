import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoundationClient} from '../src/foundation/client.js';
const session={access_token:'test-jwt',user:{id:'member-a'}};
test('Foundation RPC uses authenticated bearer and never accepts a browser owner in save parameters',async()=>{
 const rpc=createFoundationClient({url:'https://project.example',key:'public-test-key',auth:{getSession:async()=>session},fetchImpl:async(url,options)=>{assert.equal(url,'https://project.example/rest/v1/rpc/foundation_save');assert.equal(options.headers.Authorization,'Bearer test-jwt');assert.deepEqual(JSON.parse(options.body),{payload:{name:'Member'}});return Response.json({name:'Member'});}});
 assert.deepEqual(await rpc('foundation_save',{payload:{name:'Member'}},'member-a'),{name:'Member'});
});
test('an account switch before sending a save cannot write a different member profile',async()=>{
 let calls=0;const rpc=createFoundationClient({url:'https://project.example',key:'key',auth:{getSession:async()=>({...session,user:{id:'member-b'}})},fetchImpl:async()=>{calls++;}});
 await assert.rejects(rpc('foundation_save',{payload:{}},'member-a'),/account changed/);assert.equal(calls,0);
});
test('account switch during reads discards the old response',async()=>{let current=session;const rpc=createFoundationClient({url:'https://project.example',key:'key',auth:{getSession:async()=>current},fetchImpl:async()=>{current={...session,user:{id:'member-b'}};return Response.json({birthdate:'1990-01-01'});}});await assert.rejects(rpc('foundation_profile',{},'member-a'),/account changed/);});
test('unapplied schema is explicit and arbitrary backend failure text is not exposed',async()=>{for(const [code,message,expected] of [['PGRST202','function missing',/awaiting/],['XX000','secret database url',/Could not load/],['23514','Dating is available only to members aged 18 or older.',/18 or older/]]){const rpc=createFoundationClient({url:'https://project.example',key:'key',auth:{getSession:async()=>session},fetchImpl:async()=>Response.json({code,message},{status:400})});await assert.rejects(rpc('foundation_profile',{},'member-a'),expected);}});

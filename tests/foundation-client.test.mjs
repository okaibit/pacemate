import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoundationClient} from '../src/foundation/client.js';
test('Foundation uses the existing Edge API with owner checks on every request',async()=>{
 const calls=[];
 const client=createFoundationClient(async(path,options)=>{calls.push({path,options});return {profile:{name:'Member'},sports:[{id:'running'}]};});
 assert.deepEqual(await client.profile(null,'a'),{name:'Member'});
 await client.profile('member/b','a');
 assert.deepEqual(await client.sports('a'),[{id:'running'}]);
 await client.save({name:'Member'},'a');
 assert.deepEqual(calls,[{path:'/api/foundation',options:{expectedUserId:'a'}},{path:'/api/foundation/members/member%2Fb',options:{expectedUserId:'a'}},{path:'/api/foundation/sports',options:{expectedUserId:'a'}},{path:'/api/foundation',options:{method:'PUT',body:{name:'Member'},expectedUserId:'a'}}]);
});
test('Foundation preserves API failures',async()=>{const client=createFoundationClient(async()=>{throw new Error('Your account changed.');});await assert.rejects(client.save({},'a'),/account changed/);});

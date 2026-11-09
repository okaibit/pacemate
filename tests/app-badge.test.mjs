import test from 'node:test';
import assert from 'node:assert/strict';
import {setUnreadAppBadge} from '../src/app-badge.js';
test('Home Screen badge uses unread message totals and clears at zero',async()=>{
 const calls=[],nav={setAppBadge:async n=>calls.push(n),clearAppBadge:async()=>calls.push('clear')};
 await setUnreadAppBadge(4,nav);await setUnreadAppBadge(1,nav);await setUnreadAppBadge(0,nav);assert.deepEqual(calls,[4,1,'clear']);
});
test('unsupported, denied and invalid badge updates never disrupt messaging',async()=>{
 await setUnreadAppBadge(3,{});await setUnreadAppBadge(2,{setAppBadge:async()=>{throw Error('denied');}});
 const calls=[];for(const n of [-1,NaN,'3',1.2,undefined])await setUnreadAppBadge(n,{setAppBadge:n=>calls.push(n)});assert.deepEqual(calls,[]);
});

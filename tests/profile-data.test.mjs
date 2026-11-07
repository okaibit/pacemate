import test from 'node:test';
import assert from 'node:assert/strict';
import {stringList,normalizeProfileResponse} from '../supabase/functions/pacemate/server/profile-data.js';
test('raw Postgres profile arrays become sports and photo lists rather than characters',()=>{
 const data=normalizeProfileResponse({other:{name:'Alex',sports:'{Football,Gym,Running,Padel}',photos:'{member/photo.jpg}'}});
 assert.deepEqual(data.other.sports,['Football','Gym','Running','Padel']);assert.deepEqual(data.other.photos,['member/photo.jpg']);
});
test('array decoding respects quoted commas, escapes and NULL values',()=>{
 assert.deepEqual(stringList(String.raw`{"Trail, running","A \"quote\"",NULL,"NULL"}`),['Trail, running','A "quote"','NULL']);
});
test('profile normalization preserves normal arrays and handles malformed legacy values',()=>{
 assert.deepEqual(stringList(['Running','Yoga']),['Running','Yoga']);assert.deepEqual(stringList('["Running","Yoga"]'),['Running','Yoga']);
 for(const input of [null,undefined,'Running','{"unfinished}', '{{nested}}','[]','{}'])assert.deepEqual(stringList(input),[]);
});
test('list and match responses normalize nested profile arrays without changing messages',()=>{
 const data=normalizeProfileResponse({people:[{sports:'{Running}',photos:'{}'}],matches:[{id:5,other:{sports:'{Gym}',photos:'{member/image.jpg}'},last:{body:'Hello {friend}'}}]});
 assert.deepEqual(data.people[0].sports,['Running']);assert.deepEqual(data.matches[0].other.photos,['member/image.jpg']);assert.equal(data.matches[0].last.body,'Hello {friend}');
});

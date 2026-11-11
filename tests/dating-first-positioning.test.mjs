import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_TITLE,DEFAULT_DESCRIPTION,FAQ,DESCRIPTIONS} from '../src/seo.js';

const landing=await readFile(new URL('../src/views/Landing.vue',import.meta.url),'utf8');
const discover=await readFile(new URL('../src/views/Discover.vue',import.meta.url),'utf8');
const auth=await readFile(new URL('../src/views/Auth.vue',import.meta.url),'utf8');

test('public positioning leads with sports dating and keeps other intentions available',()=>{
 assert.match(landing,/Sports dating, at your pace/);
 assert.match(landing,/Date someone<br>who shares/);
 assert.match(landing,/Play and friendship are here too/);
 assert.match(landing,/connection-modes[^\n]*Dating.*Training partner.*Friendship/);
 assert.match(auth,/signup: "Meet someone who shares your pace\."/);
 assert.match(DESCRIPTIONS['/signup'],/meet dates through shared sports/i);
});

test('activities are presented as ways to meet, not a prerequisite for dating',()=>{
 assert.match(landing,/A way to meet/);
 assert.match(landing,/local sessions and activities that give a good conversation somewhere to begin/);
 assert.match(landing,/Explore activities/);
 assert.doesNotMatch(landing,/attendance|required to match/i);
});

test('search metadata reflects dating-first positioning and retains broader options',()=>{
 assert.match(DEFAULT_TITLE,/sports dating/i);
 assert.match(DEFAULT_DESCRIPTION,/shared sports/);
 assert.match(DEFAULT_DESCRIPTION,/friendship and training partners/);
 assert.match(FAQ.find(item=>item.q==='What is Pacemate?').a,/sports dating app/i);
});

test('discovery orders Date first without enabling it for members who have not chosen it',()=>{
 assert.match(discover,/id:'date'.*id:'play'.*id:'friend'/);
 assert.match(discover,/preferredDiscoveryIntention\(enabledIntentions\(\)\.map\(i=>i\.id\)\)/);
});

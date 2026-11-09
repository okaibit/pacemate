import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplySwipe} from '../src/reply-swipe.js';
test('a deliberate horizontal swipe replies once and resets the message position',()=>{
 let replies=0;const moves=[],swipe=createReplySwipe(()=>replies++,x=>moves.push(x));
 swipe.start(10,10);assert.equal(swipe.move(80,12),true);swipe.end();swipe.end();assert.equal(replies,1);assert.equal(moves.at(-1),0);
});
test('vertical scrolling, short drags, left drags and cancelled touches do not reply',()=>{
 let replies=0;const swipe=createReplySwipe(()=>replies++,()=>{});
 swipe.start(0,0);swipe.move(6,30);swipe.move(70,31);swipe.end();
 swipe.start(0,0);swipe.move(30,0);swipe.end();swipe.start(70,0);swipe.move(0,0);swipe.end();
 swipe.start(0,0);swipe.move(70,0);swipe.cancel();swipe.end();assert.equal(replies,0);
});

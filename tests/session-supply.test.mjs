import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const view=await readFile(new URL('../src/views/Events.vue',import.meta.url),'utf8');
const handler=await readFile(new URL('../supabase/functions/pacemate/handlers/events.ts',import.meta.url),'utf8');

test('curated activities are marked as suggested and empty sessions invite the first RSVP',()=>{
 assert.match(view,/<span v-if="!e\.host" class="tag">Suggested<\/span>/);
 assert.match(view,/e\.going===0\?'Be the first to join':`\$\{e\.going\} going`/);
});

test('session audience counts remain based on real RSVP rows',()=>{
 assert.match(handler,/SELECT count\(\*\)::int FROM public\.rsvps r WHERE r\.event_id=e\.id/);
 assert.doesNotMatch(handler,/going\s*\+\s*1|fake.*attendee|synthetic.*rsvp/i);
});

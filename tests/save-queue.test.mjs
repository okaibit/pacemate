import test from 'node:test';
import assert from 'node:assert/strict';
import {createSaveQueue} from '../src/save-queue.js';

test('autosaves are serialized so an older slow save cannot overwrite the latest snapshot',async()=>{
  let release;const events=[];
  const queue=createSaveQueue(async snapshot=>{events.push('start:'+snapshot);if(snapshot==='old')await new Promise(resolve=>release=resolve);events.push('end:'+snapshot);});
  const first=queue.enqueue('old');await Promise.resolve();await Promise.resolve();
  const second=queue.enqueue('new');await Promise.resolve();
  assert.deepEqual(events,['start:old']);release();await Promise.all([first,second]);
  assert.deepEqual(events,['start:old','end:old','start:new','end:new']);
});
test('a failed autosave does not prevent subsequent edits being saved',async()=>{
  const saved=[];const queue=createSaveQueue(async snapshot=>{if(snapshot==='offline')throw new Error('offline');saved.push(snapshot);});
  await assert.rejects(queue.enqueue('offline'),/offline/);await queue.enqueue('latest');await queue.drain();assert.deepEqual(saved,['latest']);
});

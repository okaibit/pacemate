import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function worker(){const events={},cached=[],opened=[];const context={URL,Promise,self:{location:{origin:'https://pacemate.test'},addEventListener:(name,fn)=>events[name]=fn,skipWaiting(){},clients:{claim(){},matchAll:async()=>[],openWindow:url=>opened.push(url)}},caches:{open:async()=>({addAll:paths=>cached.push(...paths)}),keys:async()=>[],match:async()=>({offline:true})},fetch:async()=>({ok:true})};vm.runInNewContext(readFileSync('public/sw.js','utf8'),context);return {events,cached,opened};}

test('offline installation stores only public fallback assets',async()=>{const w=worker();let done;w.events.install({waitUntil:promise=>done=promise});await done;assert.deepEqual(w.cached,['/offline.html','/app-icon.svg','/logo-mark.svg','/auto-theme.js']);});
test('service worker does not intercept authenticated API data or private image fetches',()=>{const w=worker();for(const url of ['https://project.supabase.co/functions/v1/pacemate/api/me','https://project.supabase.co/storage/v1/object/sign/chat/private','https://pacemate.test/api/me']){let intercepted=false;w.events.fetch({request:{url,mode:'cors'},respondWith(){intercepted=true;}});assert.equal(intercepted,false);}});
test('push clicks cannot open a cross-origin destination',()=>{const w=worker();let waited=false;w.events.notificationclick({notification:{data:{href:'https://evil.example'},close(){}},waitUntil(){waited=true;}});assert.equal(waited,false);assert.equal(w.opened.length,0);});
test('internal push destinations open the app',async()=>{const w=worker();let done;w.events.notificationclick({notification:{data:{href:'/app/matches/2'},close(){}},waitUntil:promise=>done=promise});await done;assert.deepEqual(w.opened,['https://pacemate.test/app/matches/2']);});

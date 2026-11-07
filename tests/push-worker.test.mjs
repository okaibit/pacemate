import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function worker(){const events={},notifications=[],opened=[];const self={location:{origin:'https://pacemate.test'},addEventListener:(name,fn)=>events[name]=fn,registration:{showNotification:async(title,options)=>notifications.push({title,...options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL});return {events,notifications,opened};}
test('push retains the conversation tag and opens the chat deep link',async()=>{
 const w=worker();let pending;w.events.push({data:{json:()=>({title:'Alex',body:'Shared a link',conversationId:42,tag:'chat-42'})},waitUntil:p=>pending=p});await pending;
 assert.equal(w.notifications[0].tag,'chat-42');assert.equal(w.notifications[0].data.href,'/chat/42');
 w.events.notificationclick({notification:{close(){},data:w.notifications[0].data},waitUntil:p=>pending=p});await pending;assert.equal(w.opened[0],'https://pacemate.test/chat/42');
});
test('notification clicks reject external destinations',()=>{
 const w=worker();w.events.notificationclick({notification:{close(){},data:{href:'https://evil.test'}},waitUntil(){assert.fail('External notification navigation');}});assert.equal(w.opened.length,0);
});
test('empty push payload still creates a visible notification',async()=>{
 const w=worker();let pending;w.events.push({data:null,waitUntil:p=>pending=p});await pending;assert.equal(w.notifications[0].title,'Pacemate');
});

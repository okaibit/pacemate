import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationPoll} from '../src/notification-poll.js';
function fixture(){
 const state={user:'a',items:[],messages:[],inboxes:[],badges:[],failBadge:false,path:'/app/discover'};
 const poll=notificationPoll({currentUser:()=>state.user,visible:()=>true,currentPath:()=>state.path,
 request:async path=>{if(path.endsWith('badges')){if(state.failBadge)throw Error('timeout');return {unread:2};}return {items:state.items,unread:state.items.length};},
 onBadges:data=>state.badges.push(data),onInbox:data=>state.inboxes.push(data),onMessage:item=>state.messages.push(item)});
 return {state,poll};
}
const message=id=>({id,kind:'message',href:'/app/matches/1'});
test('notification delivery survives badge failure and announces only new unread messages once',async()=>{
 const {state,poll}=fixture();state.failBadge=true;state.items=[message(1)];await poll.refresh();
 assert.equal(state.inboxes.length,1);assert.equal(state.messages.length,0);
 state.items=[message(2),message(1)];await poll.refresh();await poll.refresh();
 assert.deepEqual(state.messages.map(x=>x.id),[2]);
 state.items=[{...message(3),readAt:'now'},...state.items];await poll.refresh();assert.equal(state.messages.length,1);
});
test('open conversation and account history do not show incoming banners',async()=>{
 const {state,poll}=fixture();await poll.refresh();state.path='/app/matches/1';state.items=[message(1)];await poll.refresh();assert.equal(state.messages.length,0);
 state.user='b';state.path='/app/discover';state.items=[message(5)];await poll.refresh();assert.equal(state.messages.length,0);
 poll.stop();state.items=[message(6)];await poll.refresh();assert.equal(state.messages.length,0);
});
test('late responses cannot update a different account or an unmounted app',async()=>{
 let user='a';let updates=0;
 const poll=notificationPoll({request:async()=>({items:[],unread:0}),currentUser:()=>user,visible:()=>true,currentPath:()=>'',onBadges:()=>updates++,onInbox:()=>updates++,onMessage:()=>updates++});
 poll.stop();await poll.refresh();assert.equal(updates,0);
 const pending=[];const next=notificationPoll({request:()=>new Promise(r=>pending.push(r)),currentUser:()=>user,visible:()=>true,currentPath:()=>'',onBadges:()=>updates++,onInbox:()=>updates++,onMessage:()=>updates++});
 const running=next.refresh();user='b';pending.forEach(r=>r({items:[],unread:0}));await running;assert.equal(updates,0);
});

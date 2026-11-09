import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('src/composables/usePush.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'').replace('import.meta.env.VITE_VAPID_PUBLIC_KEY',JSON.stringify('B'+'A'.repeat(86)));
function fixture({permission='granted',home=false}={}){
 const calls=[],events={},sub={endpoint:'https://fcm.googleapis.com/push/device',toJSON:()=>({endpoint:'https://fcm.googleapis.com/push/device',keys:{p256dh:'A'.repeat(86),auth:'B'.repeat(22)}}),async unsubscribe(){calls.push({unsubscribe:true});}};
 const navigator={userAgent:home?'iPhone':'Android',standalone:!home,serviceWorker:{async register(){return reg;},async getRegistration(){return reg;},ready:Promise.resolve().then(()=>reg)}};
 const reg={pushManager:{async getSubscription(){return sub;}}};
 const window={isSecureContext:true,PushManager:{},Notification:{}};
 const authClient={getSession:async()=>({user:{id:'owner'},access_token:'fixture'}),onChange:fn=>events.auth=fn};
 const Notification={async requestPermission(){calls.push({permission:true});return permission;}};
 const api=async(path,options)=>{calls.push({path,options});return path.startsWith('/api/settings')?{pushKey:'fixture'}:{subscribed:true,enabled:true};};
 const state=new Function('ref','computed','window','navigator','matchMedia','authClient','api','Notification','atob',source+'\nreturn {enablePush,disablePush,syncPush,usePush};')(v=>({value:v}),fn=>({get value(){return fn();}}),window,navigator,()=>({matches:false}),authClient,api,Notification,atob);
 return {state,calls,events};
}
test('enabling push persists the device through the authenticated API, not client-supplied user IDs',async()=>{const f=fixture();await f.state.enablePush();assert.equal(f.calls[0].permission,true);const post=f.calls.find(c=>c.options?.method==='POST');assert.equal(post.path,'/api/notifications/push');assert.equal(post.options.expectedUserId,'owner');assert.equal(post.options.body.user_id,undefined);assert.equal(f.state.usePush().enabled.value,true);});
test('denying permission never creates a server subscription',async()=>{const f=fixture({permission:'denied'});await assert.rejects(f.state.enablePush(),/Allow notifications/);assert.equal(f.calls.length,1);});
test('iPhone requires home-screen installation before asking for permission',async()=>{const f=fixture({home:true});await assert.rejects(f.state.enablePush(),/Home Screen/);assert.equal(f.calls.length,0);});
test('disabling push deletes only the current device before unsubscribing it',async()=>{const f=fixture();await f.state.disablePush();assert.equal(f.calls[0].path,'/api/notifications/push');assert.equal(f.calls[0].options.method,'DELETE');assert.equal(f.calls[1].unsubscribe,true);assert.equal(f.state.usePush().enabled.value,false);});
test('device state is synchronized against the server preference',async()=>{const f=fixture();await f.state.syncPush();assert.match(f.calls[0].path,/^\/api\/notifications\/push\?endpoint=/);assert.equal(f.state.usePush().enabled.value,true);});

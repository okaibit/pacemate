import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('src/composables/usePush.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
function fixture({permission='granted',home=false,publicKey='B'+'A'.repeat(86),settingsRequest,storage=new Map(),userId='owner'}={}){
 const calls=[],events={},sub={endpoint:'https://fcm.googleapis.com/push/device',toJSON:()=>({endpoint:'https://fcm.googleapis.com/push/device',keys:{p256dh:'A'.repeat(86),auth:'B'.repeat(22)}}),async unsubscribe(){calls.push({unsubscribe:true});}};
 const navigator={userAgent:home?'iPhone':'Android',standalone:!home,serviceWorker:{async register(){return reg;},async getRegistration(){return reg;},ready:Promise.resolve().then(()=>reg)}};
 const reg={pushManager:{async getSubscription(){return sub;}}};
 const window={localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},isSecureContext:true,PushManager:{},Notification:{}};
 const authClient={getSession:async()=>({user:{id:userId},access_token:'fixture'}),onChange:fn=>events.auth=fn};
 const Notification={async requestPermission(){calls.push({permission:true});return permission;}};
 const api=async(path,options)=>{calls.push({path,options});return path.startsWith('/api/settings')?(settingsRequest?settingsRequest():{pushKey:'B'+'A'.repeat(86)}):{subscribed:true,enabled:true};};
 const state=new Function('ref','computed','window','navigator','matchMedia','authClient','api','Notification','atob','setUnreadAppBadge',source.replace('import.meta.env.VITE_VAPID_PUBLIC_KEY',JSON.stringify(publicKey))+'\nreturn {enablePush,disablePush,syncPush,noteMessage,usePush};')(v=>({value:v}),fn=>({get value(){return fn();}}),window,navigator,()=>({matches:false}),authClient,api,Notification,atob,()=>{});
 return {state,calls,events,storage};
}
test('enabling push persists the device through the authenticated API, not client-supplied user IDs',async()=>{const f=fixture();await f.state.enablePush();assert.equal(f.calls[0].permission,true);const post=f.calls.find(c=>c.options?.method==='POST');assert.equal(post.path,'/api/notifications/push');assert.equal(post.options.expectedUserId,'owner');assert.equal(post.options.body.user_id,undefined);assert.equal(f.state.usePush().enabled.value,true);});
test('denying permission never creates a server subscription',async()=>{const f=fixture({permission:'denied'});await assert.rejects(f.state.enablePush(),/Allow notifications/);assert.equal(f.calls.length,1);});
test('iPhone requires home-screen installation before asking for permission',async()=>{const f=fixture({home:true});await assert.rejects(f.state.enablePush(),/Home Screen/);assert.equal(f.calls.length,0);});
test('disabling push deletes only the current device before unsubscribing it',async()=>{const f=fixture();await f.state.disablePush();assert.equal(f.calls[0].path,'/api/notifications/push');assert.equal(f.calls[0].options.method,'DELETE');assert.equal(f.calls[1].unsubscribe,true);assert.equal(f.state.usePush().enabled.value,false);});
test('device state is synchronized against the server preference',async()=>{const f=fixture();await f.state.syncPush();assert.match(f.calls[0].path,/^\/api\/notifications\/push\?endpoint=/);assert.equal(f.state.usePush().enabled.value,true);});

test('simultaneous badge and inbox signals wait for the shared public key before showing Enable',async()=>{
 let resolve;const f=fixture({publicKey:'',settingsRequest:()=>new Promise(r=>resolve=r)});
 const first=f.state.noteMessage(),second=f.state.noteMessage();assert.equal(first,second);
 assert.equal(f.state.usePush().showPrompt.value,false);await Promise.resolve();assert.equal(f.calls.length,1);
 resolve({pushKey:'B'+'A'.repeat(86)});await first;
 assert.equal(f.state.usePush().showPrompt.value,true);await f.state.enablePush();
 assert.ok(f.calls.some(c=>c.options?.method==='POST'));assert.equal(f.calls.filter(c=>c.permission).length,1);
});
test('failed configuration requests do not offer an unusable Enable button and can retry',async()=>{
 let attempts=0;const f=fixture({publicKey:'',settingsRequest:async()=>{if(!attempts++)throw Error('timeout');return {pushKey:'B'+'A'.repeat(86)};}});
 await f.state.noteMessage();assert.equal(f.state.usePush().showPrompt.value,false);
 await f.state.noteMessage();assert.equal(f.state.usePush().showPrompt.value,true);
});

test('permission prompt is shown once per account on the same device across app launches',async()=>{
 const storage=new Map(),first=fixture({storage});await first.state.noteMessage();assert.equal(first.state.usePush().showPrompt.value,true);
 first.state.usePush().markShown();assert.equal(first.state.usePush().showPrompt.value,true);
 const reopened=fixture({storage});await reopened.state.noteMessage();assert.equal(reopened.state.usePush().showPrompt.value,false);
 const other=fixture({storage,userId:'other'});await other.state.noteMessage();assert.equal(other.state.usePush().showPrompt.value,true);
});
test('Not now persists and manual notification setup remains available',async()=>{
 const storage=new Map(),f=fixture({storage});await f.state.noteMessage();f.state.usePush().dismiss();assert.equal(f.state.usePush().showPrompt.value,false);
 const next=fixture({storage});await next.state.noteMessage();assert.equal(next.state.usePush().showPrompt.value,false);
 await next.state.enablePush();assert.equal(next.state.usePush().enabled.value,true);
});

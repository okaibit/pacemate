import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('src/pwa.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export \{.*\} from .*;\n/gm,'').replace(/export /g,'');
function fixture({standalone=false,ios=false,tablet=false}={}){
 const events={},modes={},navigator={userAgent:ios?'iPhone':'Desktop',platform:tablet?'MacIntel':'',maxTouchPoints:tablet?5:0};
 const window={addEventListener:(key,fn)=>events[key]=fn,matchMedia:()=>({matches:standalone,addEventListener:(key,fn)=>modes[key]=fn})};
 const state=new Function('ref','window','navigator',source+'\nreturn {appInstalled,installAvailable,installBusy,appleMobile,installApp,registerWorker};')(value=>({value}),window,navigator);
 return {events,modes,state,navigator};
}
const promptEvent=(outcome='accepted')=>({calls:0,preventDefault(){this.prevented=true;},async prompt(){this.calls++;},userChoice:Promise.resolve({outcome})});
test('browser event exposes install action and is consumed once by a user action',async()=>{const f=fixture(),event=promptEvent();assert.equal(f.state.installAvailable.value,false);f.events.beforeinstallprompt(event);assert.equal(event.prevented,true);assert.equal(f.state.installAvailable.value,true);assert.equal(event.calls,0);assert.equal((await f.state.installApp()).outcome,'accepted');assert.equal(event.calls,1);await f.state.installApp();assert.equal(event.calls,1);assert.equal(f.state.appInstalled.value,false);f.events.appinstalled();assert.equal(f.state.appInstalled.value,true);});
test('dismissal allows manual instructions and a future browser prompt',async()=>{const f=fixture();f.events.beforeinstallprompt(promptEvent('dismissed'));assert.equal((await f.state.installApp()).outcome,'dismissed');assert.equal(f.state.installAvailable.value,false);f.events.beforeinstallprompt(promptEvent());assert.equal(f.state.installAvailable.value,true);});
test('standalone apps do not expose redundant install prompts',async()=>{const f=fixture({standalone:true}),event=promptEvent();f.events.beforeinstallprompt(event);assert.equal(f.state.appInstalled.value,true);assert.equal(f.state.installAvailable.value,false);assert.equal((await f.state.installApp()).outcome,'unavailable');assert.equal(event.calls,0);});
test('iPhone and touch-based iPads are recognized for manual installation',()=>{assert.equal(fixture({ios:true}).state.appleMobile,true);assert.equal(fixture({tablet:true}).state.appleMobile,true);assert.equal(fixture().state.appleMobile,false);});
test('failed prompts clear busy state without claiming installation',async()=>{const f=fixture(),event=promptEvent();event.prompt=async()=>{throw Error('Denied');};f.events.beforeinstallprompt(event);await assert.rejects(f.state.installApp());assert.equal(f.state.installBusy.value,false);assert.equal(f.state.appInstalled.value,false);});
test('concurrent clicks cannot reuse an install prompt',async()=>{const f=fixture(),event=promptEvent();let finish;event.prompt=()=>new Promise(r=>finish=r);f.events.beforeinstallprompt(event);const first=f.state.installApp();assert.equal((await f.state.installApp()).outcome,'unavailable');finish();await first;});
test('display mode changes update installed state',()=>{const f=fixture();f.modes.change({matches:true});assert.equal(f.state.appInstalled.value,true);f.modes.change({matches:false});assert.equal(f.state.appInstalled.value,false);});
test('manifest has standalone launch and existing install icons',()=>{const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/app/discover');assert.equal(manifest.scope,'/');for(const icon of manifest.icons){const bytes=readFileSync('public'+new URL(icon.src,'https://pacemate.test').pathname);assert.equal(bytes.readUInt32BE(16),parseInt(icon.sizes));assert.equal(bytes.readUInt32BE(20),parseInt(icon.sizes));}});

test('install and browser icons use the existing two-tone leaf mark',()=>{
 const svg=readFileSync('public/app-icon.svg','utf8');assert.ok(svg.includes('#e4eccb'));assert.ok(svg.includes('#e3815e'));assert.ok(svg.includes('#102c23'));
 assert.equal(readFileSync('public/favicon.svg','utf8'),svg);
 const apple=readFileSync('public/icon-180.png');assert.equal(apple.readUInt32BE(16),180);assert.equal(apple.readUInt32BE(20),180);
 assert.ok(readFileSync('index.html','utf8').includes('/icon-180.png?v=leaf-1'));
});

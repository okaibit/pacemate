import test from 'node:test';
import assert from 'node:assert/strict';
import {bindChatViewport} from '../src/chat-viewport.js';
function style(){const values=new Map();return {getPropertyValue:key=>values.get(key)?.value||'',getPropertyPriority:key=>values.get(key)?.priority||'',setProperty(key,value,priority=''){values.set(key,{value,priority});},removeProperty:key=>values.delete(key)};}
function events(extra={}){const listeners=new Map();return {...extra,listeners,addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},emit(name){listeners.get(name)?.();}};}
function fixture({visual=true}={}){
 let scheduled;const scrolls=[];
 const viewport=events({height:844,offsetTop:0,scale:1});
 const win=events({innerHeight:844,scrollX:0,scrollY:180,visualViewport:visual?viewport:undefined,requestAnimationFrame:fn=>{scheduled=fn;return 1;},cancelAnimationFrame:()=>scheduled=null,scrollTo:(...args)=>scrolls.push(args)});
 const input={tagName:'INPUT'},doc={body:{style:style()},documentElement:{style:style()},activeElement:null};
 const element=events({style:style(),contains:el=>el===input});
 const flush=()=>{const fn=scheduled;scheduled=null;fn?.();};
 return {win,viewport,doc,element,input,flush,scrolls};
}
test('keyboard shrinks the chat while offset keeps its header in the visible viewport',()=>{
 const f=fixture(),stop=bindChatViewport(f.element,f);
 assert.equal(f.element.style.getPropertyValue('--chat-height'),'844px');
 f.doc.activeElement=f.input;f.viewport.height=410;f.viewport.offsetTop=70;f.viewport.emit('resize');f.viewport.emit('scroll');f.flush();
 assert.equal(f.element.style.getPropertyValue('--chat-height'),'410px');assert.equal(f.element.style.getPropertyValue('--chat-top'),'70px');assert.equal(f.element.style.getPropertyValue('--chat-bottom-safe-area'),'0px');
 f.doc.activeElement=null;f.viewport.height=844;f.viewport.offsetTop=0;f.viewport.emit('resize');f.flush();assert.equal(f.element.style.getPropertyValue('--chat-height'),'844px');
 assert.equal(f.scrolls.length,0);stop();
});
test('leaving chat restores document styles and scroll position and removes listeners',()=>{
 const f=fixture();f.doc.body.style.setProperty('overflow','auto','important');f.element.style.setProperty('--chat-top','3px');
 const stop=bindChatViewport(f.element,f);f.viewport.emit('resize');stop();f.flush();
 assert.equal(f.doc.body.style.getPropertyValue('overflow'),'auto');assert.equal(f.doc.body.style.getPropertyPriority('overflow'),'important');assert.equal(f.doc.body.style.getPropertyValue('position'),'');assert.equal(f.element.style.getPropertyValue('--chat-top'),'3px');
 assert.equal(f.viewport.listeners.size,0);assert.equal(f.element.listeners.size,0);assert.equal(f.win.listeners.size,0);assert.deepEqual(f.scrolls,[[0,180]]);
});
test('fallback handles window resize and visual viewport fitting does not override pinch zoom',()=>{
 const f=fixture({visual:false}),stop=bindChatViewport(f.element,f);f.win.innerHeight=420;f.win.emit('resize');f.flush();assert.equal(f.element.style.getPropertyValue('--chat-height'),'420px');stop();
 const zoom=fixture(),end=bindChatViewport(zoom.element,zoom);zoom.viewport.scale=2;zoom.viewport.height=200;zoom.viewport.emit('resize');zoom.flush();assert.equal(zoom.element.style.getPropertyValue('--chat-height'),'844px');end();
});

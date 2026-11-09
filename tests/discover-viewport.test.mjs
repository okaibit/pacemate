import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverHeight,fitDiscoverViewport} from '../src/discover-viewport.js';

function createFixture({top=150,height=844,width=390,navTop=740,visual=true,resizeObserver=true}={}){
 const listeners=new Map();let pending=null,observed=[];
 const page={style:{values:{},getPropertyValue(key){return this.values[key]||'';},setProperty(key,value){this.values[key]=value;},removeProperty(key){delete this.values[key];}},getBoundingClientRect:()=>({top})};
 const nav={getBoundingClientRect:()=>({top:navTop})};
 const header={};
 class Observer{constructor(fn){this.fn=fn;}observe(el){observed.push(el);}disconnect(){observed=[];}}
 const win={innerHeight:height,innerWidth:width,visualViewport:visual?{height,addEventListener(type,fn){listeners.set('visual:'+type,fn);},removeEventListener(type){listeners.delete('visual:'+type);}}:null,
  addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);},requestAnimationFrame(fn){pending=fn;return 1;},cancelAnimationFrame(){pending=null;},...(resizeObserver?{ResizeObserver:Observer}:{})};
 const doc={querySelector(selector){return selector.includes('nav')?nav:header;}};
 return {page,nav,header,win,doc,listeners,observed,flush(){const fn=pending;pending=null;fn?.();}};
}

test('viewport height leaves the mobile navigation dock clear on short and tall phones',()=>{
 assert.equal(discoverHeight(140,667,575),427);
 assert.equal(discoverHeight(140,844,752),604);
});
test('desktop sizing uses the viewport bottom instead of the side navigation',()=>{
 const f=createFixture({top:160,height:900,width:1200,navTop:300});
 const stop=fitDiscoverViewport(f.page,{win:f.win,doc:f.doc});
 assert.equal(f.page.style.getPropertyValue('--discover-height'),'712px');
 stop();
});
test('phone sizing uses the bottom navigation and follows visual viewport resizes',()=>{
 const f=createFixture();const stop=fitDiscoverViewport(f.page,{win:f.win,doc:f.doc});
 assert.equal(f.page.style.getPropertyValue('--discover-height'),'582px');
 f.nav.getBoundingClientRect=()=>({top:680});f.listeners.get('visual:resize')();f.flush();
 assert.equal(f.page.style.getPropertyValue('--discover-height'),'522px');
 stop();assert.equal(f.page.style.getPropertyValue('--discover-height'),'');assert.equal(f.listeners.size,0);
});

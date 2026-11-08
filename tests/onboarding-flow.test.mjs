import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parse,compileScript} from '@vue/compiler-sfc';
import {rolldown} from 'rolldown';
import {ONBOARDING_STEPS} from '../src/onboarding.js';
const fixture=globalThis.__onboardingFlow={session:{user:{id:'member-a'},profile:null},pending:[],navigation:[],dispose:[],locations:[]};
const {descriptor}=parse(readFileSync('src/views/Onboarding.vue','utf8'));
const script=compileScript(descriptor,{id:'onboarding-flow'}).content;
const built=await rolldown({input:'onboarding-fixture',plugins:[{name:'onboarding-fixtures',resolveId(id){
 if(id==='onboarding-fixture')return '\0onboarding';
 if(['vue','vue-router','../api.js','../auth.js'].includes(id)||id.endsWith('.vue'))return '\0fixture:'+id;
 if(id==='../options.js')return resolve('src/options.js');
 if(id==='../onboarding.js')return resolve('src/onboarding.js');
 if(id==='../location.js')return '\0fixture:location';
},load(id){
 if(id==='\0onboarding')return script;
 if(id==='\0fixture:vue')return 'export const reactive=value=>value;export const ref=value=>({value});export const computed=fn=>({get value(){return fn();}});export const watch=()=>{};export const nextTick=async()=>{};export const onBeforeUnmount=fn=>globalThis.__onboardingFlow.dispose.push(fn);';
 if(id==='\0fixture:vue-router')return 'export const useRouter=()=>({replace:async path=>globalThis.__onboardingFlow.navigation.push(path)});';
 if(id==='\0fixture:location')return 'export const requestLocation=()=>new Promise((resolve,reject)=>globalThis.__onboardingFlow.locations.push({resolve,reject}));';
 if(id==='\0fixture:../api.js')return 'export const api=(path,options)=>new Promise((resolve,reject)=>globalThis.__onboardingFlow.pending.push({path,options,resolve,reject}));';
 if(id==='\0fixture:../auth.js')return 'export const session=globalThis.__onboardingFlow.session;export const logout=async()=>{};';
 if(id.startsWith('\0fixture:'))return 'export default {};';
}}]});
const output=await built.generate({format:'esm'});await built.close();
const {default:Onboarding}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
test.beforeEach(()=>{fixture.session.user={id:'member-a'};fixture.session.profile=null;fixture.pending=[];fixture.navigation=[];fixture.dispose=[];fixture.locations=[];});
function view(){const result=Onboarding.setup({}, {expose(){}});Object.assign(result.f,{name:'Alex',birthdate:'1998-01-01',gender:'Man',interestedIn:['Woman'],goal:'A training partner',sports:['Running'],homeCity:'Abuja'});return result;}
function review(v){v.step.value=ONBOARDING_STEPS.length-1;}
test('answers advance to an unsaved preview; only the final action saves once',async()=>{
 const v=view();while(v.cur.value.key!=='review')await v.next();
 assert.equal(fixture.pending.length,0);assert.equal(fixture.session.profile,null);
 const save=v.next();await v.next();v.back();assert.equal(v.cur.value.key,'review');
 assert.equal(fixture.pending.length,1);assert.equal(fixture.pending[0].path,'/api/me');assert.equal(fixture.pending[0].options.expectedUserId,'member-a');
 fixture.pending[0].resolve({profile:{id:'member-a'}});await save;
 assert.deepEqual(fixture.navigation,['/app/discover']);assert.equal(fixture.session.profile.id,'member-a');
});
test('failed save keeps answers on review and can be retried',async()=>{
 const v=view();review(v);const save=v.next();fixture.pending.shift().reject(new Error('Offline'));await save;
 assert.equal(v.err.value,'Offline');assert.equal(v.busy.value,false);assert.equal(v.f.name,'Alex');assert.equal(v.cur.value.key,'review');assert.equal(fixture.navigation.length,0);
 const retry=v.next();fixture.pending.shift().resolve({profile:{id:'member-a'}});await retry;assert.deepEqual(fixture.navigation,['/app/discover']);
});
test('a changed account cannot send a save or apply an old response',async()=>{
 const v=view();review(v);fixture.session.user={id:'member-b'};await v.next();assert.equal(fixture.pending.length,0);
 fixture.session.user={id:'member-a'};const save=v.next();fixture.session.user={id:'member-b'};fixture.pending.shift().resolve({profile:{id:'member-a'}});await save;
 assert.equal(fixture.session.profile,null);assert.equal(fixture.navigation.length,0);
});
test('final save revalidates earlier answers and uploads block step changes',async()=>{
 const v=view();review(v);v.f.birthdate='2020-01-01';await v.next();assert.equal(v.cur.value.key,'birthdate');assert.match(v.err.value,/18 or older/);assert.equal(fixture.pending.length,0);
 v.photoBusy.value=true;const index=v.step.value;v.back();await v.next();assert.equal(v.step.value,index);
});
test('leaving onboarding ignores a late save response',async()=>{
 const v=view();review(v);const save=v.next();fixture.dispose.at(-1)();fixture.pending.shift().resolve({profile:{id:'member-a'}});await save;
 assert.equal(fixture.session.profile,null);assert.equal(fixture.navigation.length,0);
});
test('location requires an explicit action and suggests an editable city without changing home',async()=>{
 const v=view();v.step.value=ONBOARDING_STEPS.findIndex(s=>s.key==='city');
 assert.equal(fixture.locations.length,0);assert.equal(fixture.pending.length,0);
 const location=v.useLocation();assert.equal(v.locationBusy.value,true);await v.next();assert.equal(v.cur.value.key,'city');
 fixture.locations.shift().resolve({latitude:6.52,longitude:3.38});await Promise.resolve();
 const lookup=fixture.pending.shift();assert.equal(lookup.path,'/api/location');assert.equal(lookup.options.expectedUserId,'member-a');
 lookup.resolve({city:'Lagos'});await location;assert.equal(v.f.homeCity,'Abuja');assert.equal(v.f.currentCity,'Lagos');assert.equal(v.locationBusy.value,false);
 assert.equal(v.cur.value.key,'city');v.f.currentCity='Accra';assert.equal(v.f.currentCity,'Accra');
});
test('denied location keeps manual entry and never contacts the city endpoint',async()=>{
 const v=view();const location=v.useLocation();fixture.locations.shift().reject(new Error('Location permission was not granted. Enter your city instead.'));await location;
 assert.equal(fixture.pending.length,0);assert.equal(v.locationBusy.value,false);assert.equal(v.f.homeCity,'Abuja');assert.match(v.locationNotice.value,/Enter your city/);
});

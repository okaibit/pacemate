import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,compileScript} from '@vue/compiler-sfc';
import {rolldown} from 'rolldown';
import {formatPlusPrice,paymentDestination} from '../src/plus.js';

const fixture=globalThis.__plus={session:{user:{id:'member-a'}},calls:[],redirects:[],dispose:[],respond:null};
const {descriptor}=parse(readFileSync('src/views/Plus.vue','utf8'));
const script=compileScript(descriptor,{id:'plus-fixture'}).content;
const bundle=await rolldown({input:'plus-fixture',plugins:[{name:'offline-plus',resolveId(id){
 if(id==='plus-fixture')return '\0plus';
 if(['vue','vue-router','../api.js','../auth.js'].includes(id))return '\0fixture:'+id;
 if(id==='../options.js')return new URL('../src/options.js',import.meta.url).pathname;
 if(id==='../plus-plans.js')return new URL('../src/plus-plans.js',import.meta.url).pathname;
 if(id==='../money.js'||id==='../money-preferences.js')return new URL('../src/'+id.slice(3),import.meta.url).pathname;
 if(id.endsWith('.vue'))return '\0fixture:component';
 if(id==='../plus.js')return new URL('../src/plus.js',import.meta.url).pathname;
},load(id){
 if(id==='\0plus')return script;
 if(id==='\0fixture:component')return 'export default {};';
 if(id==='\0fixture:vue')return 'export const ref=value=>({value});export const reactive=value=>value;export const computed=fn=>({get value(){return fn();}});export const nextTick=async()=>{};export const onMounted=()=>{};export const onBeforeUnmount=fn=>globalThis.__plus.dispose.push(fn);';
 if(id==='\0fixture:vue-router')return 'export const useRoute=()=>({hash:""});';
 if(id==='\0fixture:../api.js')return 'export const api=async(path,options)=>{globalThis.__plus.calls.push({path,options});return globalThis.__plus.respond(path,options);};';
 if(id==='\0fixture:../auth.js')return 'export const session=globalThis.__plus.session;export const loadProfile=async()=>{};';
}}]});
const output=await bundle.generate({format:'esm'});await bundle.close();
const {default:Plus}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
const price={id:'ng-month-v1',amount:300000,currency:'NGN',interval:'month',intervalCount:1,available:true};
const setup=()=>Plus.setup({}, {expose(){}});
const originalWindow=globalThis.window;
const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
test.before(()=>Object.defineProperty(globalThis,'navigator',{value:{languages:[]},configurable:true}));
test.after(()=>{if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;});
test.beforeEach(()=>{fixture.session.user={id:'member-a'};fixture.calls=[];fixture.redirects=[];fixture.dispose=[];globalThis.window={location:{assign:url=>fixture.redirects.push(url)}};});
test.afterEach(()=>{globalThis.window=originalWindow;});

test('free members can save one upcoming city through the existing primary profile slot',async()=>{
 let primary=null;
 fixture.respond=async(path,options)=>{
  if(path.includes('/config'))return {active:false,enabled:false,prices:[]};
  if(path.includes('/history'))return {payments:[]};
  if(path==='/api/trips/primary'){assert.equal(options.method,'PUT');assert.deepEqual(options.body,{city:'Lisbon',arrival:'2027-01-01'});primary={id:'primary',primary:true,city:'Lisbon',arrival:'2027-01-01'};return {ok:true};}
  return {plans:primary?[primary]:[],upcomingCount:primary?1:0};
 };
 const view=setup();await view.load();view.trip.city='Lisbon';view.trip.arrival='2027-01-01';await view.addTrip();
 assert.equal(view.plans.value[0].primary,true);assert.equal(view.upcoming.value,1);assert.ok(view.canPlan.value);
});
test('approved plan previews remain visible but disconnected billing cannot start checkout',async()=>{
 fixture.respond=async path=>path.includes('/trips')?{plans:[]}:path.includes('/history')?{payments:[]}:{enabled:false,active:false,prices:[]};const view=setup();await view.load();await view.payment('checkout');
 assert.match(view.price.value,/3,000/);assert.equal(view.prices.value.length,3);assert.equal(fixture.calls.length,3);assert.deepEqual(fixture.redirects,[]);assert.match(view.error.value,/Payments are not available/);
});
test('test switch uses authenticated server endpoint and refreshes server-confirmed access',async()=>{
 let active=false;
 fixture.respond=async(path,options)=>{
  if(path.includes('/config'))return {active,testAccess:true,enabled:false,prices:[]};
  if(path.includes('/history'))return {payments:[]};
  if(path.includes('/test-access')){assert.equal(options.expectedUserId,'member-a');assert.deepEqual(options.body,{membership:'plus'});active=true;return {active:true};}
  return {plans:[]};
 };
 const view=setup();await view.load();await view.setTestMembership('plus');assert.equal(view.active.value,true);assert.deepEqual(fixture.redirects,[]);assert.match(view.notice.value,/No payment/);
});
test('frontend does not offer a switch when server test access is disabled',async()=>{
 fixture.respond=async path=>path.includes('/config')?{active:false,testAccess:false}:path.includes('/history')?{payments:[]}:{plans:[]};
 const view=setup();await view.load();const before=fixture.calls.length;await view.setTestMembership('plus');assert.equal(fixture.calls.length,before);
});
test('Plus members can add and remove trips with server-confirmed results',async()=>{
 let plans=[];
 fixture.respond=async(path,options)=>{
  if(path.includes('/config'))return {active:true,enabled:true};
  if(path.includes('/history'))return {payments:[]};
  if(options?.method==='POST'){assert.deepEqual(options.body,{city:'Lisbon',arrival:'2027-01-01'});plans=[{id:1,city:'Lisbon',arrival:'2027-01-01'}];return {ok:true};}
  if(options?.method==='DELETE'){plans=[];return {ok:true};}
  return {plans,plus:true};
 };
 const view=setup();await view.load();view.trip.city='Lisbon';view.trip.arrival='2027-01-01';await view.addTrip();
 assert.equal(view.plans.value.length,1);assert.equal(view.trip.city,'');
 await view.removeTrip(view.plans.value[0]);assert.deepEqual(view.plans.value,[]);
 assert.ok(fixture.calls.every(c=>c.options.expectedUserId==='member-a'));
});
test('revoked subscription fails closed and retains a clear error',async()=>{
 fixture.respond=async path=>path.includes('/config')?{active:true}:path.includes('/history')?{payments:[]}:{plans:[],plus:true};const view=setup();await view.load();
 fixture.respond=async()=>{throw Object.assign(new Error('Multiple planned cities require Pacemate Plus.'),{status:403});};
 await view.addTrip();assert.equal(view.active.value,false);assert.deepEqual(view.plans.value,[]);assert.match(view.error.value,/Plus/);
});
test('a response after leaving the page does not apply plans',async()=>{
 let resolve;fixture.respond=()=>new Promise(r=>resolve=r);const view=setup();const load=view.load();fixture.dispose[0]();resolve({active:true});await load;assert.equal(view.billing.value,null);assert.deepEqual(view.plans.value,[]);
});
test('price formatting handles billing periods and rejects missing or malformed prices',()=>{
 assert.match(formatPlusPrice({...price,intervalCount:3}),/3 months/);
 for(const value of [null,{...price,amount:-1},{...price,interval:'forever'},{...price,currency:'invalid'}])assert.equal(formatPlusPrice(value),'');
 for(const url of ['http://checkout.stripe.com/a','https://checkout.stripe.com.evil.example/a','https://user@checkout.stripe.com/a','https://checkout.stripe.com:444/a'])assert.throws(()=>paymentDestination(url,'checkout'));
 assert.throws(()=>paymentDestination('https://billing.stripe.com/p/session','portal'),/disabled/);
});

test('downgraded members retain their travel list but cannot add another city',async()=>{
 fixture.respond=async path=>path.includes('/config')?{active:false,enabled:false,prices:[]}:path.includes('/history')?{payments:[]}:{plans:[{id:1,city:'Lisbon',arrival:'2027-01-01'}],upcomingCount:1};
 const view=setup();await view.load();assert.equal(view.active.value,false);assert.equal(view.plans.value.length,1);
 const before=fixture.calls.length;await view.addTrip();assert.equal(fixture.calls.length,before);
});

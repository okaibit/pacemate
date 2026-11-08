import test from 'node:test';
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';

const fixture=globalThis.__authGate={session:{},guard:null};
const bundle=await rolldown({input:'src/router.js',plugins:[{
 name:'offline-auth-gate',
 resolveId(id){
  if(id==='vue-router'||id==='./auth.js'||id==='./seo.js'||id.endsWith('.vue'))return '\0gate:'+id;
 },
 load(id){
  if(id==='\0gate:vue-router')return 'export const createWebHistory=()=>({});export const createRouter=()=>({beforeEach:fn=>globalThis.__authGate.guard=fn,afterEach(){}});';
  if(id==='\0gate:./auth.js')return 'export const session=globalThis.__authGate.session;';
  if(id==='\0gate:./seo.js')return 'export const SITE_URL="",DEFAULT_TITLE="",DEFAULT_DESCRIPTION="",DESCRIPTIONS={},INDEXABLE=[];';
  if(id.startsWith('\0gate:'))return 'export default {};';
 }
}]});
const output=await bundle.generate({format:'esm',codeSplitting:false});await bundle.close();
await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));

test('authenticated members without server acknowledgement are sent to Auth before onboarding or Discover',()=>{
 Object.assign(fixture.session,{user:{id:'google-member'},profile:{id:'google-member'},adultTermsAccepted:false});
 for(const path of ['/onboarding','/app/discover'])assert.equal(fixture.guard({path,fullPath:path,meta:{auth:true},matched:[{meta:{profile:path.startsWith('/app')}}]}),'/login');
 assert.equal(fixture.guard({path:'/login',meta:{guest:true},matched:[]}),undefined);
 assert.equal(fixture.guard({path:'/terms',meta:{},matched:[]}),undefined);
});

test('server acknowledgement allows the existing profile routing to continue',()=>{
 fixture.session.adultTermsAccepted=true;
 assert.equal(fixture.guard({path:'/login',meta:{guest:true},matched:[]}),'/app/discover');
 fixture.session.profile=null;
 assert.equal(fixture.guard({path:'/login',meta:{guest:true},matched:[]}),'/onboarding');
});

test('a rejected callback reaches Auth even if router history was created before callback cleanup',()=>{
 fixture.session.user=null;fixture.session.callback='error';
 assert.equal(fixture.guard({path:'/',meta:{},matched:[]}),'/login');
 assert.equal(fixture.guard({path:'/login',meta:{guest:true},matched:[]}),undefined);
 fixture.session.callback=null;
});

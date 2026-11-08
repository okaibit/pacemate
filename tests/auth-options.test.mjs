import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,compileScript} from '@vue/compiler-sfc';
import {rolldown} from 'rolldown';
const fixture=globalThis.__authOptions={providers:{google:true},settingsError:false,oauthError:false,redirects:[],session:{},ackRequests:[],navigation:[],ackError:false};
const {descriptor}=parse(readFileSync('src/views/Auth.vue','utf8'));
const script=compileScript(descriptor,{id:'auth-options'}).content;
const built=await rolldown({input:'auth-options',plugins:[{name:'offline-auth-options',resolveId(id){if(id==='auth-options')return '\0auth-view';if(['vue','vue-router','../supabase.js','../auth.js','../api.js','../components/Modal.vue'].includes(id))return '\0fixture:'+id;},load(id){
 if(id==='\0auth-view')return script;
 if(id==='\0fixture:vue')return 'export const ref=value=>({value});export const computed=fn=>({get value(){return fn();}});export const watch=()=>{};export const onMounted=()=>{};';
 if(id==='\0fixture:vue-router')return 'export const useRoute=()=>({query:{}});export const useRouter=()=>({push(){},replace:path=>globalThis.__authOptions.navigation.push(path)});';
 if(id==='\0fixture:../auth.js')return 'export const session=globalThis.__authOptions.session;export const loadProfile=async()=>{session.adultTermsAccepted=globalThis.__authOptions.ackRequests.length>0&&!globalThis.__authOptions.ackError;};';
 if(id==='\0fixture:../api.js')return 'export const api=async(path,options)=>{globalThis.__authOptions.ackRequests.push({path,options});if(globalThis.__authOptions.ackError)throw new Error("Acknowledgement unavailable");return {adultTermsAccepted:true};};';
 if(id==='\0fixture:../supabase.js')return 'export const login=async()=>{},signup=async()=>{},requestPasswordRecovery=async()=>{};export const getSettings=async()=>{if(globalThis.__authOptions.settingsError)throw new Error("Offline");return {providers:globalThis.__authOptions.providers};};export const oauthLogin=async provider=>{if(globalThis.__authOptions.oauthError)throw new Error("Unavailable");globalThis.__authOptions.redirects.push(provider);};';
 if(id==='\0fixture:../components/Modal.vue')return 'export default {};';
}}]});
const output=await built.generate({format:'esm'});await built.close();
const {default:Auth}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
test.beforeEach(()=>{fixture.providers={google:true};fixture.settingsError=false;fixture.oauthError=false;fixture.redirects=[];fixture.ackRequests=[];fixture.navigation=[];fixture.ackError=false;for(const key of Object.keys(fixture.session))delete fixture.session[key];});
test('signup begins with method chooser and Google needs adult acknowledgement, not email/password',async()=>{
 const view=Auth.setup({mode:'signup'},{expose(){}});assert.equal(view.emailMethod.value,false);await view.loadProviders();
 await view.startOAuth('google');assert.equal(fixture.redirects.length,0);assert.match(view.err.value,/18/);
 view.adult.value=true;await view.startOAuth('google');await view.startOAuth('google');assert.deepEqual(fixture.redirects,['google']);
 assert.equal(view.email.value,'');assert.equal(view.password.value,'');
});
test('disabled Google cannot redirect and provider loading errors are retryable',async()=>{
 const view=Auth.setup({mode:'login'},{expose(){}});fixture.providers={google:false};await view.loadProviders();await view.startOAuth('google');assert.equal(fixture.redirects.length,0);
 fixture.settingsError=true;await view.loadProviders();assert.ok(view.providersError.value);assert.equal(view.providersLoading.value,false);
 fixture.settingsError=false;fixture.providers={google:true};await view.loadProviders();assert.equal(view.providersError.value,'');assert.deepEqual(view.oauth.value,['google']);
});
test('email selection opens the form and OAuth failures allow retry',async()=>{
 const view=Auth.setup({mode:'login'},{expose(){}});view.chooseEmail();assert.equal(view.emailMethod.value,true);
 await view.loadProviders();fixture.oauthError=true;await view.startOAuth('google');assert.equal(view.busy.value,false);assert.equal(view.err.value,'Unavailable');
 fixture.oauthError=false;await view.startOAuth('google');assert.deepEqual(fixture.redirects,['google']);
});

test('a Google-created login account must save acknowledgement on the server before continuing',async()=>{
 fixture.session.user={id:'new-google-member'};
 const view=Auth.setup({mode:'login'},{expose(){}});
 assert.equal(view.needsAcknowledgement.value,true);
 await view.acceptTerms();assert.equal(fixture.ackRequests.length,0);assert.match(view.err.value,/18/);
 view.adult.value=true;await view.acceptTerms();
 assert.deepEqual(fixture.ackRequests,[{path:'/api/me',options:{method:'POST',body:{adultTermsAccepted:true},expectedUserId:'new-google-member'}}]);
 assert.equal(fixture.session.adultTermsAccepted,true);assert.deepEqual(fixture.navigation,['/onboarding']);
});

test('failed server acknowledgement keeps the member at the gate with a clear error',async()=>{
 fixture.session.user={id:'member'};fixture.ackError=true;
 const view=Auth.setup({mode:'login'},{expose(){}});view.adult.value=true;
 await view.acceptTerms();assert.equal(view.needsAcknowledgement.value,true);assert.equal(view.busy.value,false);
 assert.equal(view.err.value,'Acknowledgement unavailable');assert.deepEqual(fixture.navigation,[]);
});

test('OAuth callback rejection is shown by Auth without losing the retry path',async()=>{
 fixture.session.notice='Sign-in callback rejected. Start sign-in again in this browser.';
 const view=Auth.setup({mode:'login'},{expose(){}});await view.loadProviders();
 assert.match(fixture.session.notice,/callback rejected/);
 assert.match(readFileSync('src/views/Auth.vue','utf8'),/role="alert">{{ session.notice }}/);
 await view.startOAuth('google');assert.equal(fixture.session.notice,'');assert.deepEqual(fixture.redirects,['google']);
});

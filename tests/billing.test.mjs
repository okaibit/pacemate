import test from 'node:test';
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';
import {entitled} from '../supabase/functions/pacemate/money/contracts.js';
const env={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
globalThis.Deno={env:{get:key=>env[key]}};
const state=globalThis.__billingFixture={};
const compiled=await rolldown({input:'supabase/functions/pacemate/handlers/billing.ts',plugins:[{name:'offline-billing-db',resolveId(id){if(id.endsWith('/db/index.ts'))return '\0billing-db';},load(id){if(id==='\0billing-db')return `export const withDatabaseDeadline=fn=>fn(globalThis.__billingFixture.client);export const db={select:()=>({from:()=>({where:async()=>[{id:'member',suspended:false}]})})};`;}}]});
const output=await compiled.generate({format:'esm',codeSplitting:false});await compiled.close();
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
const originalFetch=globalThis.fetch;
function enable(){Object.assign(env,{PACEMATE_ENV:'test',PACEMATE_TEST_PLUS_ENABLED:'true',PACEMATE_TEST_PROJECT_REF:'abcdefghijklmnopqrst',PACEMATE_TEST_PLUS_USERS:'member'});}
function fixture(){
 for(const key of Object.keys(env))if(key.startsWith('PACEMATE_'))delete env[key];
 state.subscription=null;state.calls=[];state.requests=[];state.preferences=null;
 state.offer={id:'ng-month-test-v2',country_code:'NG',plan_id:'plus',currency:'NGN',billing_interval:'month',interval_count:1,amount_minor:'300000',approved:true,active:true,effective_from:'2026-11-08T00:00:00Z'};
 state.client={begin:async fn=>fn(state.client),unsafe:async(sql,params=[])=>{
  state.calls.push({sql,params});
  if(sql.includes('public.feature_limits'))return [{hits:1}];
  if(sql.startsWith('SELECT * FROM public.subscriptions'))return state.subscription?[state.subscription]:[];
  if(sql.startsWith('SELECT 1 FROM public.subscriptions'))return entitled(state.subscription)&&(state.subscription.provider!=='test'||params[1])?[{one:1}]:[];
  if(sql.startsWith('INSERT INTO public.subscriptions')){state.subscription={user_id:params[0],subscription_id:state.subscription?.subscription_id||params[1],provider:'test',plan_id:'plus',status:'active',paid_through:new Date(Date.now()+86400000).toISOString(),amount_minor:null};return [];}
  if(sql.startsWith('UPDATE public.subscriptions')){if(state.subscription?.provider==='test'){state.subscription.status='canceled';state.subscription.paid_through=new Date().toISOString();}return [];}
  if(sql.startsWith('SELECT * FROM public.regional_prices'))return params[0]==='NG'?[state.offer]:[];
  if(sql.startsWith('SELECT * FROM public.billing_preferences'))return state.preferences?[state.preferences]:[];
  if(sql.startsWith('INSERT INTO public.billing_preferences')){state.preferences={country_code:params[1],display_currency:params[2],billing_country:params[3]};return [];}
  return [];
 }};
 globalThis.fetch=async(url)=>{state.requests.push(url);if(url.endsWith('/auth/v1/user'))return Response.json({id:'member',email:'fixture@example.test',app_metadata:{pacemate_adult_terms_accepted_at:'2026-11-08T00:00:00Z'}});throw Error('Unexpected hosted service request');};
}
test.beforeEach(fixture);test.afterEach(()=>globalThis.fetch=originalFetch);
async function call(action,method='GET',payload,query='',authorized=true){return handler(new Request('https://function.test/api/billing/'+action+query,{method,headers:{...(authorized?{Authorization:'Bearer fixture'}:{}),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined}),{params:{action}});}
const switchTo=membership=>call('test-access','POST',{membership});
test('test membership defaults off; prices are previews and payment availability is disabled',async()=>{const c=await(await call('config')).json();assert.equal(c.testAccess,false);assert.equal(c.active,false);assert.equal(c.enabled,false);assert.equal(c.prices[0].available,false);assert.equal((await switchTo('plus')).status,403);});
test('all payment and webhook routes are retired without external requests or entitlement writes',async()=>{for(const action of ['checkout','portal','cancel','sync','webhook'])assert.equal((await call(action,'POST',{})).status,410);assert.equal(state.requests.length,0);assert.equal(state.subscription,null);});
test('enabled allowlisted test member gets 24-hour Plus without a payment',async()=>{enable();const start=Date.now();assert.equal((await switchTo('plus')).status,200);const c=await(await call('config')).json();assert.equal(c.active,true);assert.equal(c.testAccess,true);assert.equal(c.subscription.provider,'test');assert.ok(Date.parse(c.subscription.paidThrough)>=start+86400000);assert.equal(c.subscription.amountMinor,null);assert.ok(!state.calls.some(c=>c.sql.includes('INSERT INTO public.payments')));});
test('switching to Free revokes access and never deletes social or travel records',async()=>{enable();await switchTo('plus');assert.equal((await switchTo('free')).status,200);assert.equal((await(await call('config')).json()).active,false);assert.ok(!state.calls.some(c=>/DELETE|TRUNCATE/.test(c.sql)));});
test('expired test access is Free without a renewal or deletion',async()=>{enable();await switchTo('plus');state.subscription.paid_through='2000-01-01T00:00:00Z';assert.equal((await(await call('config')).json()).active,false);});
test('turning off the switch immediately stops previously active test access',async()=>{enable();await switchTo('plus');env.PACEMATE_TEST_PLUS_ENABLED='false';const c=await(await call('config')).json();assert.equal(c.active,false);assert.equal(c.subscription,null);assert.equal((await switchTo('plus')).status,403);});
test('production environment cannot activate or retain test access',async()=>{enable();await switchTo('plus');env.PACEMATE_ENV='production';assert.equal((await switchTo('plus')).status,403);assert.equal((await(await call('config')).json()).active,false);});
test('project identity must match the test project secret',async()=>{enable();env.PACEMATE_TEST_PROJECT_REF='differentprojectrefxx';assert.equal((await switchTo('plus')).status,403);delete env.PACEMATE_TEST_PROJECT_REF;assert.equal((await switchTo('plus')).status,403);});
test('an unlisted account cannot activate or retain test access',async()=>{enable();await switchTo('plus');env.PACEMATE_TEST_PLUS_USERS='another-member';assert.equal((await switchTo('plus')).status,403);assert.equal((await(await call('config')).json()).active,false);});
test('anonymous requests cannot use membership controls or read billing',async()=>{enable();assert.equal((await call('test-access','POST',{membership:'plus'},'',false)).status,401);assert.equal((await call('config','GET',undefined,'',false)).status,401);});
test('body cannot select another user, amount, expiry or membership',async()=>{enable();for(const body of [{membership:'admin'},{membership:'plus',userId:'victim'},{membership:'plus',expiresAt:'2099-01-01'},{membership:'plus',amount:1}])assert.equal((await call('test-access','POST',body)).status,422);assert.equal(state.subscription,null);});
test('membership writes are serialized and use authenticated ownership',async()=>{enable();await switchTo('plus');const lock=state.calls.find(c=>c.sql.includes('FOR UPDATE'));assert.deepEqual(lock.params,['member']);const insert=state.calls.find(c=>c.sql.startsWith('INSERT INTO public.subscriptions'));assert.equal(insert.params[0],'member');assert.match(insert.sql,/24 hours/);});
test('repeated toggles keep one subscription identity and create no payment',async()=>{enable();await switchTo('plus');const id=state.subscription.subscription_id;await switchTo('plus');await switchTo('free');await switchTo('plus');assert.equal(state.subscription.subscription_id,id);assert.equal(state.subscription.provider,'test');});
test('existing real subscription records cannot be overwritten or revoked by test controls',async()=>{enable();state.subscription={user_id:'member',provider:'stripe',status:'active',plan_id:'plus',paid_through:new Date(Date.now()+86400000).toISOString(),amount_minor:'299',currency:'USD'};const before=JSON.stringify(state.subscription);for(const membership of ['plus','free'])assert.equal((await switchTo(membership)).status,409);assert.equal(JSON.stringify(state.subscription),before);assert.equal((await(await call('config')).json()).active,true);});
test('display preferences do not change test access or historical contracts',async()=>{enable();await switchTo('plus');const before=JSON.stringify(state.subscription);assert.equal((await call('preferences','PUT',{countryCode:'NG',billingCountry:'US',displayCurrency:'JPY'})).status,200);assert.equal(JSON.stringify(state.subscription),before);});
test('unconfigured markets have no invented prices',async()=>{const c=await(await call('config','GET',undefined,'?country=FR')).json();assert.deepEqual(c.prices,[]);assert.equal(c.enabled,false);});
test('test controls require POST and a complete unsuspended profile',async()=>{enable();assert.equal((await call('test-access')).status,405);globalThis.fetch=async()=>Response.json({id:'member',email:'fixture@example.test'});assert.equal((await switchTo('plus')).status,403);});
test('history remains authenticated and validates pagination',async()=>{assert.equal((await call('history')).status,200);assert.equal((await call('history','GET',undefined,'?offset=-1')).status,422);const c=state.calls.find(c=>c.sql.includes('LIMIT 51 OFFSET'));assert.deepEqual(c.params,['member',0]);});

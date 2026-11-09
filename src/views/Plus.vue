<script setup>
import {ref,reactive,computed,onMounted,onBeforeUnmount,nextTick} from 'vue';
import {api} from '../api.js';
import {useRoute} from 'vue-router';
import {session,loadProfile} from '../auth.js';
import {CITIES,utcToday,tripMaxDate} from '../options.js';
import {formatPlusPrice,receiptDestination} from '../plus.js';
import {COUNTRIES,COUNTRY_BY_CODE,formatMoney} from '../money.js';
import {readMoneyPreferences,saveMoneyPreferences} from '../money-preferences.js';
import {planCountry,planCards,planRate,planCta} from '../plus-plans.js';
import MoneyPreferences from '../components/MoneyPreferences.vue';

const owner=session.user?.id,route=useRoute();
const billing=ref(null),plans=ref([]),loading=ref(true),busy=ref(''),error=ref(''),notice=ref('');
const trip=reactive({city:'',arrival:'',countryCode:''});
const preferences=ref(readMoneyPreferences(owner));
const billingCountry=ref(planCountry(session.profile)),selectedPrice=ref(''),history=ref([]),historyMore=ref(false),historyOffset=ref(0),serverUpcoming=ref(null);
const prices=computed(()=>planCards(billingCountry.value,billing.value?.prices||[]));
const chosen=computed(()=>prices.value.find(p=>p.id===selectedPrice.value));
const contract=computed(()=>billing.value?.subscription);
const locale=computed(()=>COUNTRY_BY_CODE[preferences.value.countryCode]?.locale||'en');
function amount(value,currency){return formatMoney(value,currency,{locale:locale.value,historical:true});}
function date(value){return value?new Intl.DateTimeFormat(locale.value,{dateStyle:'medium'}).format(new Date(value)):'Not scheduled';}
async function savePreferences(){await task('preferences',async()=>{
 const result=await api('/api/billing/preferences',{method:'PUT',body:{...preferences.value,billingCountry:billingCountry.value},expectedUserId:owner});
 if(current())preferences.value=saveMoneyPreferences(owner,result.preferences);
 await load();
});}
async function setTestMembership(membership){
 if(!billing.value?.testAccess)return;
 await task('test',async()=>{
  await api('/api/billing/test-access',{method:'POST',body:{membership},expectedUserId:owner});
  if(current()){await load();notice.value=membership==='plus'?'Test Plus is active for 24 hours. No payment was made.':'Test access removed. Your membership is Free; your data is preserved.';}
 });
}
const price=computed(()=>formatPlusPrice(chosen.value,locale.value));
const active=computed(()=>billing.value?.active===true);
const primary=computed(()=>plans.value.find(plan=>plan.primary));
const canPlan=computed(()=>active.value?upcoming.value<5:!!primary.value||upcoming.value===0);
const upcoming=computed(()=>serverUpcoming.value??plans.value.filter(plan=>plan.arrival>=utcToday()).length);
let disposed=false,preferencesLoaded=false;
const current=()=>!disposed&&session.user?.id===owner;
onBeforeUnmount(()=>{disposed=true;plans.value=[];});
async function load(){
 loading.value=true;error.value='';billing.value=null;plans.value=[];
 try{
  const config=await api('/api/billing/config?country='+encodeURIComponent(billingCountry.value),{expectedUserId:owner});
  if(!current())return;
  billing.value=config;
  if(!preferencesLoaded){if(config.preferences)preferences.value=saveMoneyPreferences(owner,config.preferences);billingCountry.value=config.country||billingCountry.value;preferencesLoaded=true;}
  if(!prices.value.some(p=>p.id===selectedPrice.value))selectedPrice.value=prices.value.find(p=>p.interval==='month')?.id||prices.value[0]?.id||'';
  const payments=await api('/api/billing/history',{expectedUserId:owner});if(current()){history.value=payments.payments;historyMore.value=!!payments.hasMore;historyOffset.value=payments.nextOffset||0;}
  const result=await api('/api/trips',{expectedUserId:owner});if(current()){plans.value=result.plans;serverUpcoming.value=Number.isInteger(result.upcomingCount)?result.upcomingCount:null;}
 }catch(e){if(current())error.value=e.message;}
 finally{if(current())loading.value=false;}
}
async function task(name,fn){
 if(busy.value||!current())return;
 busy.value=name;error.value='';notice.value='';
 try{await fn();}catch(e){if(current()){error.value=e.message;if(e.status===403){billing.value=null;plans.value=[];}}}
 finally{if(current())busy.value='';}
}
async function payment(){error.value='Payments are not available. No payment provider is connected.';}
async function moreHistory(){await task('history',async()=>{const result=await api('/api/billing/history?offset='+historyOffset.value,{expectedUserId:owner});if(current()){history.value.push(...result.payments);historyMore.value=!!result.hasMore;historyOffset.value=result.nextOffset;}});}
async function refreshPlans(){const result=await api('/api/trips',{expectedUserId:owner});if(current()){plans.value=result.plans;serverUpcoming.value=Number.isInteger(result.upcomingCount)?result.upcomingCount:null;}}
async function addTrip(){
 if(!canPlan.value)return;
 await task('trip',async()=>{
  await api(active.value?'/api/trips':'/api/trips/primary',{method:active.value?'POST':'PUT',body:{city:trip.city,arrival:trip.arrival,...(active.value&&trip.countryCode?{countryCode:trip.countryCode}:{})},expectedUserId:owner});
  if(!active.value&&current())await loadProfile();
  if(!current())return;
  trip.city='';trip.arrival='';notice.value='City added.';await refreshPlans();
 });
}
async function removeTrip(plan){await task('trip',async()=>{
 await api(plan.primary?'/api/trips/dismiss':'/api/trips/'+encodeURIComponent(plan.id),{method:plan.primary?'POST':'DELETE',expectedUserId:owner});
 if(plan.primary&&current())await loadProfile();
 if(current()){notice.value='City removed.';await refreshPlans();}
});}
async function arrived(plan){await task('trip',async()=>{
 await api('/api/trips/arrive',{method:'POST',body:plan.primary?{}:{tripId:plan.id},expectedUserId:owner});
 if(current()){await loadProfile();notice.value='Current city updated.';await refreshPlans();}
});}
onMounted(async()=>{await load();if(route.query?.checkout)notice.value='Payments are disabled. A return URL does not activate Plus.';if(current()&&route.hash==='#travel-plans'){await nextTick();document.getElementById('travel-plans')?.scrollIntoView({block:'start'});}});
</script>
<template>
 <div class="plus-page" :aria-busy="loading">
  <header class="plus-hero"><img src="/images/hero.jpg" alt="Two runners sharing a run by the sea" class="hero-photo"><RouterLink class="hero-close" to="/app/profile" aria-label="Close Plus">×</RouterLink><div class="hero-copy"><p class="hero-brand"><img class="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true">Pacemate <span>PLUS</span></p><h1>Better together.</h1><p>More connections. A shared pace.</p></div></header>
  <p v-if="loading" role="status">Loading Plus…</p>
  <p v-if="error" class="err" role="alert">{{error}}</p>
  <button v-if="!loading&&!billing" type="button" class="btn ghost" @click="load">Try again</button>
  <p v-if="notice" class="ok" role="status">{{notice}}</p>
  <template v-if="!loading&&billing">
   <section v-if="billing.testAccess" class="test-membership" aria-label="Test membership controls"><h2>Test membership</h2><p>No charge or automatic renewal. Test Plus expires after 24 hours.</p><div class="row"><button type="button" class="btn ghost" :disabled="!!busy||!active" @click="setTestMembership('free')">Use Free</button><button type="button" class="btn" :disabled="!!busy||active" @click="setTestMembership('plus')">{{busy==='test'?'Updating…':'Try Plus'}}</button></div></section>
   <section class="membership">
    <template v-if="active"><span class="membership-status">{{contract?.provider==='test'?'Your test Plus membership is active':'Your Plus membership is active'}}</span><p v-if="contract?.provider==='test'">Expires {{date(contract.paidThrough)}}. No payment was made.</p><h2>Make your next connection.</h2><template v-if="contract?.amountMinor"><p>{{amount(contract.amountMinor,contract.currency)}} {{contract.currency}} / {{contract.billingInterval}}</p><p v-if="contract.renewalAt">Next renewal: {{date(contract.renewalAt)}} at {{amount(contract.amountMinor,contract.currency)}} {{contract.currency}}.</p><p>Paid through {{date(contract.paidThrough)}}.</p><p v-if="contract.status==='past_due'">Your renewal payment needs attention. Access continues through your paid period.</p><p v-if="contract.cancelAtPeriodEnd||contract.status==='canceled'">Renewal is cancelled.</p><p v-else>Payments are disconnected. Existing provider subscriptions must be managed with the original provider.</p></template></template>
    <template v-else>
     <div class="plan-heading"><h2>Choose your plan</h2></div>
     <div v-if="prices.length" class="plan-options" role="radiogroup" aria-label="Plus billing plan">
      <label v-for="option in prices" :key="option.id" class="plan-option" :class="{selected:selectedPrice===option.id}">
       <input type="radio" v-model="selectedPrice" :value="option.id" name="plus-price" :disabled="!!busy" :aria-label="planCta(option)">
       <span class="plan-period">{{option.header}}</span>
       <span class="plan-duration">1 {{option.interval}}</span>
       <strong class="weekly-rate">{{planRate(option)}}</strong>
       <span class="sr-only">Total charge: {{amount(option.amount,option.currency)}} {{option.currency}} per {{option.interval}}</span>
      </label>
     </div>
     <p v-else class="availability" role="status">Plans are not available for this location yet.</p>
     <p v-if="billing.enabled&&chosen&&chosen.currency!==preferences.displayCurrency" class="availability">You will be charged in {{chosen.currency}}. Your display preference is {{preferences.displayCurrency}}; no conversion is applied.</p>
     <button v-if="billing.hasCustomer" type="button" class="billing-link" :disabled="!!busy" @click="payment('portal')">Manage billing</button>
    </template>
   </section>
   <section class="feature"><span class="benefit-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></span><div><h2>See who likes you</h2><p>See the people who have already liked your profile.</p><RouterLink v-if="active" class="feature-link" to="/app/likes">View my likes</RouterLink><span v-else class="included">Included with Plus</span></div></section>
   <section id="travel-plans" class="feature travel"><span class="benefit-icon travel-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="7" width="16" height="14" rx="3"/><path d="M9 7V4h6v3M8 11v6m8-6v6"/></svg></span><div><h2>Meet before you arrive</h2><p>Plan one upcoming city for free, or up to five with Plus. Find connections before you get there.</p>
    <template>
     <ul v-if="plans.length" class="plans"><li v-for="plan in plans" :key="plan.id"><div><strong>{{plan.city}}</strong><span>{{plan.arrival}}</span></div><button v-if="plan.arrival<=utcToday()" type="button" class="feature-link" :disabled="!!busy" @click="arrived(plan)">I’ve arrived</button><button type="button" class="remove" :disabled="!!busy" :aria-label="'Remove trip to '+plan.city" @click="removeTrip(plan)">Remove</button></li></ul>
     <p v-else class="empty">Your next destination starts here.</p>
     <p class="trip-count">{{upcoming}} of {{active?5:1}} upcoming {{active?'cities':'city'}}</p>
     <p v-if="!active&&primary" class="included">Your Free destination is {{primary.city}}. Submit a city below to replace it.</p><p v-if="!active&&upcoming>1" class="included">Your existing destinations are preserved. Remove extra cities before adding a new one.</p><form v-if="canPlan" @submit.prevent="addTrip"><fieldset :disabled="!!busy"><label v-if="active" class="field"><span>Destination country or territory</span><select v-model="trip.countryCode"><option value="">Choose a country (optional)</option><option v-for="country in COUNTRIES" :key="country.code" :value="country.code">{{country.name}}</option></select></label><label class="field"><span>City</span><input v-model="trip.city" list="plus-cities" maxlength="60" required placeholder="Where are you heading?"></label><datalist id="plus-cities"><option v-for="city in CITIES" :key="city" :value="city"/></datalist><label class="field"><span>Arrival date</span><input v-model="trip.arrival" type="date" :min="utcToday()" :max="tripMaxDate()" required></label><button class="btn" type="submit">{{busy==='trip'?'Saving…':!active&&primary?'Replace city':'Add city'}}</button></fieldset></form>
    </template>
   </div></section>
   <details id="country-preferences" class="region-settings"><summary>Country and currency</summary><MoneyPreferences v-model="preferences" :disabled="!!busy"/><button class="btn ghost" type="button" :disabled="!!busy" @click="savePreferences">Save preferences</button></details>
   <section v-if="(contract||billing.hasCustomer)&&!active" class="previous-contract"><p v-if="contract?.amountMinor">Original subscription: {{amount(contract.amountMinor,contract.currency)}} {{contract.currency}} / {{contract.billingInterval}}. Paid through {{date(contract.paidThrough)}}.</p><p>Payments are disconnected. Historical records are preserved.</p></section>
   <section v-if="history.length||(contract&&contract.provider!=='test')||billing.hasCustomer" class="payment-history"><h2>Payment history</h2><p v-if="!history.length">No payments recorded.</p><ul v-else class="plans"><li v-for="payment in history" :key="payment.invoiceReference"><div><strong>{{amount(payment.amountMinor,payment.currency)}} {{payment.currency}}</strong><span>{{payment.status}} · {{date(payment.paidAt||payment.createdAt)}}</span><span>{{payment.invoiceReference}}</span><a v-if="receiptDestination(payment.receiptUrl)" :href="receiptDestination(payment.receiptUrl)" target="_blank" rel="noopener noreferrer" class="feature-link">View receipt</a><span v-if="BigInt(payment.refundedMinor||0)>0n">Refunded: {{amount(payment.refundedMinor,payment.currency)}} {{payment.currency}}</span></div></li></ul><button v-if="historyMore" class="feature-link" :disabled="!!busy" @click="moreHistory">Earlier payments</button><p v-if="contract&&!active">Your membership is Free. Existing destinations are kept; adding additional cities requires Plus.</p><p>Changing billing currency requires a new subscription after your existing paid period ends. Your current contract will not be converted.</p></section>
   <p class="free-note">Unlimited likes, matching and messaging stay free.</p>
  </template>
  <div v-if="!loading&&billing&&!active" class="purchase-bar"><button class="btn purchase-button" type="button" :disabled="true" @click="payment('checkout')">Payments unavailable</button><p>No payment provider is connected. Displayed prices are plan previews.</p></div>
 </div>
</template>
<style scoped>
.region-settings{margin:0 0 24px}.region-settings summary{cursor:pointer;min-height:44px}.price-options{display:flex;flex-direction:column;gap:14px;margin:20px 0}.price-options label{display:flex;align-items:center;gap:10px;font-size:14px}.payment-history{padding:28px 0}.payment-history>p{font-size:12px;color:var(--mute)}.plus-page{max-width:680px;margin:auto}.back-link{display:inline-flex;align-items:center;min-height:44px;font-size:12px;text-underline-offset:4px}header{padding:24px 0 32px}.eyebrow{font-size:11px;letter-spacing:.16em;font-weight:700;color:var(--coral);margin:0 0 18px}h1{font:400 clamp(36px,6vw,54px)/1.1 var(--editorial);letter-spacing:-.035em}h2{font:600 23px/1.2 var(--display);margin:0 0 12px}.membership{padding:28px;border:1px solid var(--line);border-radius:24px;background:var(--soft);margin-bottom:10px}.membership-status{display:block;font-size:12px;color:var(--green);margin-bottom:12px}.price{font-size:23px;margin:20px 0}.availability{font-size:13px;color:var(--mute)}.billing-link{display:block;background:none;border:0;min-height:44px;text-decoration:underline;cursor:pointer;padding:12px 0;font-size:12px}.feature{display:flex;gap:20px;padding:28px 0;border-bottom:1px solid var(--line)}.feature>div{flex:1;min-width:0}.number{color:var(--coral);font:16px var(--editorial);padding-top:4px}.feature p{color:var(--mute);font-size:14px;line-height:1.6;margin:0 0 12px}.feature-link,.remove{display:inline-flex;align-items:center;background:none;border:0;padding:8px 0;min-height:44px;color:var(--green);font:600 12px var(--body);text-decoration:underline;text-underline-offset:4px;cursor:pointer}.included{font-size:11px;color:var(--mute)}.plans{list-style:none;padding:0;margin:20px 0}.plans li{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--line)}.plans li>div{display:flex;flex-direction:column;flex:1;min-width:0;overflow-wrap:anywhere}.plans span{font-size:12px;color:var(--mute)}.remove{color:var(--mute)}fieldset{border:0;padding:0;margin:0}.travel form{margin-top:20px}.free-note{font-size:12px;color:var(--mute);margin-top:24px}.trip-count{font-size:12px!important}.feature .empty{margin-top:24px}.plus-page :deep(.btn){border-radius:999px;transition:none}.plus-page :deep(.btn:hover){transform:none;box-shadow:none}.plus-page input{border-radius:12px}button:disabled{opacity:.5;cursor:not-allowed}#travel-plans{scroll-margin-top:100px}
@media(max-width:480px){.membership{padding:24px}.feature{gap:14px}.feature h2{font-size:21px}.plans li{flex-wrap:wrap}.plans li>div{flex-basis:100%}}

.plus-page{padding-bottom:16px}.plus-hero{position:relative;height:280px;padding:0;border-radius:24px;overflow:hidden;margin:0 0 28px;background:var(--premium-bg);color:var(--premium-ink)}.hero-photo{position:absolute;width:100%;height:100%;object-fit:cover;object-position:center 44%}.plus-hero:after{content:'';position:absolute;inset:0;background:rgba(8,28,20,.46)}.hero-copy{position:absolute;z-index:1;bottom:24px;left:26px;right:24px}.hero-brand{display:flex;align-items:center;gap:10px;font:500 28px var(--editorial);margin:0 0 14px}.hero-brand span{font:700 11px var(--body);border:1px solid currentColor;border-radius:7px;padding:4px 7px;letter-spacing:.06em}.hero-copy h1{font:700 clamp(32px,6vw,48px)/1.1 var(--display);letter-spacing:-.04em;margin:0 0 12px}.hero-copy>p:last-child{font-size:14px;margin:0}.hero-close{position:absolute;right:16px;top:14px;z-index:2;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:rgba(8,28,20,.45);font-size:30px;line-height:1;text-decoration:none}
.membership{padding:0;background:none;border:0;margin:0}.membership:has(.membership-status){padding:24px;border:1px solid var(--line);background:var(--soft);border-radius:24px}.plan-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 18px}.plan-heading h2{font-size:23px;margin:0}.plan-heading label{max-width:45%}.plan-heading select{font-size:12px;min-height:40px!important;padding-block:8px!important}.plan-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.plan-option{position:relative;display:flex;align-items:center;flex-direction:column;min-width:0;border:1px solid var(--line);border-radius:12px;padding:0 8px 24px;overflow:hidden;cursor:pointer;text-align:center;background:var(--card)}.plan-option.selected{border:2px solid var(--coral);padding:0 7px 23px}.plan-option input{position:absolute;width:1px;height:1px;opacity:0}.plan-option:focus-within{outline:3px solid var(--coral);outline-offset:3px}.plan-period{align-self:stretch;background:color-mix(in srgb,var(--line) 70%,var(--bg));padding:11px 2px;margin:0 -8px 22px;font-size:11px;font-weight:700}.selected .plan-period{background:var(--coral);color:var(--on);margin-inline:-7px}.plan-option strong{font:700 clamp(13px,2.8vw,22px)/1.3 var(--display);letter-spacing:-.04em;max-width:100%;white-space:nowrap}.plan-currency{font-size:12px;margin-top:5px}.plan-caption{font-size:11px;color:var(--mute);margin-top:14px}.plan-unavailable{font-size:10px;color:var(--mute);margin-top:8px}.feature{gap:16px;border:0;padding:23px 0 0}.feature h2{font-size:21px;margin-bottom:6px}.feature p{font-size:13px}.benefit-icon{display:grid;place-items:center;background:var(--soft);color:var(--green);border-radius:50%;width:46px;height:46px;flex:none}.benefit-icon svg{width:23px;height:23px}.travel-icon{color:var(--coral);background:color-mix(in srgb,var(--coral) 12%,var(--bg))}.region-settings{border-top:1px solid var(--line);margin:26px 0 0;padding-top:12px}.purchase-bar{position:sticky;bottom:100px;z-index:9;background:var(--bg);border:1px solid var(--line);border-radius:22px;margin-top:24px;padding:16px}.purchase-button{width:100%;font-size:14px;min-height:50px}.purchase-bar p{font-size:11px;color:var(--mute);line-height:1.5;text-align:center;margin:10px 0 0}.payment-history{margin-top:20px}.free-note{text-align:center}.included{display:none}
@media(max-width:360px){.plan-option strong{font-size:12px}.plan-period{font-size:10px}}
@media(max-width:480px){.plus-hero{height:250px;border-radius:22px}.hero-copy{left:22px;bottom:22px}.hero-brand{font-size:25px}.hero-copy>p:last-child{font-size:13px}.plan-heading{align-items:flex-start}.plan-heading h2{font-size:21px;padding-top:8px}.plan-heading label{max-width:43%}.plan-options{gap:10px}.purchase-bar{padding:12px;bottom:100px}.purchase-button{padding-inline:12px}.feature h2{font-size:19px}}
.plan-duration{font-size:16px;font-weight:500;margin:0 0 14px}.plan-option{color:var(--ink)}.weekly-rate{letter-spacing:-.045em!important}@media(min-width:600px){.plan-duration{font-size:21px}.plan-period{font-size:13px}}
</style>

<style scoped>.test-membership{padding:24px;margin-bottom:24px;border:1px solid var(--line);border-radius:24px;background:var(--soft)}.test-membership p{font-size:13px;line-height:1.6;color:var(--mute)}.test-membership .row{flex-wrap:wrap;gap:12px}</style>

<style scoped>.hero-brand{font-family:var(--display);font-weight:800;letter-spacing:-.04em}</style>

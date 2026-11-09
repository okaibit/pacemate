<script setup>
import {reactive,ref,computed,watch,nextTick,onBeforeUnmount} from 'vue';
import {useRouter} from 'vue-router';
import {api} from '../api.js';
import {session,logout} from '../auth.js';
import {GENDERS,GOALS,LEVELS,ROUTINES,SPORTS,CITIES} from '../options.js';
import {ONBOARDING_STEPS,validateOnboardingStep,onboardingPayload,onboardingPreview} from '../onboarding.js';
import PhotoManager from '../components/PhotoManager.vue';
import ProfileCard from '../components/ProfileCard.vue';
import {COUNTRIES,detectCountry} from '../money.js';
import {requestLocation} from '../location.js';

const router=useRouter(),owner=session.user?.id;
const f=reactive({name:session.user?.name||'',birthdate:'',countryCode:detectCountry()||'NG',gender:'',interestedIn:[],ageMin:18,ageMax:45,goal:'',sports:[],level:'',routine:'',homeCity:'',currentCity:'',bio:'',photos:[]});
const step=ref(0),err=ref(''),busy=ref(false),photoBusy=ref(false),title=ref(null);
const cur=computed(()=>ONBOARDING_STEPS[step.value]);
const preview=computed(()=>onboardingPreview(f));
const locationBusy=ref(false),locationNotice=ref('');
const locked=computed(()=>busy.value||photoBusy.value||locationBusy.value);
const latestBirthdate=new Date();latestBirthdate.setUTCFullYear(latestBirthdate.getUTCFullYear()-18);
const maxBirthdate=latestBirthdate.toISOString().slice(0,10);
let active=true;
onBeforeUnmount(()=>active=false);
watch(step,async()=>{await nextTick();title.value?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});});
function toggle(values,value,max=99){if(locked.value)return;const index=values.indexOf(value);if(index>=0)values.splice(index,1);else if(values.length<max)values.push(value);}
function back(){if(locked.value||step.value===0)return;err.value='';step.value--;}
async function next(){
 if(locked.value)return;
 if(!active||session.user?.id!==owner){err.value='Your account changed. Refresh this page.';return;}
 err.value=validateOnboardingStep(cur.value.key,f);
 if(err.value)return;
 if(cur.value.key!=='review'){step.value++;return;}
 // Recheck all fields before the only save, including values edited via Back.
 const invalid=ONBOARDING_STEPS.findIndex(item=>validateOnboardingStep(item.key,f));
 if(invalid>=0){step.value=invalid;err.value=validateOnboardingStep(ONBOARDING_STEPS[invalid].key,f);return;}
 busy.value=true;
 try{
  const {profile}=await api('/api/me',{method:'PUT',body:onboardingPayload(f),expectedUserId:owner});
  if(!active||session.user?.id!==owner)return;
  session.profile=profile;session.profileError='';
  await router.replace('/app/discover');
 }catch(error){if(active&&session.user?.id===owner)err.value=error.message;}
 finally{if(active)busy.value=false;}
}
async function useLocation(){
 if(locked.value)return;
 locationBusy.value=true;locationNotice.value='';
 const beforeHome=f.homeCity,beforeCurrent=f.currentCity;
 try{
  const position=await requestLocation();
  if(!active||session.user?.id!==owner)return;
  const {city}=await api('/api/location',{method:'POST',body:position,expectedUserId:owner});
  if(!active||session.user?.id!==owner||f.homeCity!==beforeHome||f.currentCity!==beforeCurrent)return;
  if(city){f.currentCity=city;if(!f.homeCity.trim())f.homeCity=city;locationNotice.value=`Suggested city: ${city}. Check it before continuing.`;}
  else locationNotice.value='No nearby city was found. Enter your city below.';
 }catch(error){if(active&&session.user?.id===owner)locationNotice.value=error.status?'City suggestions are unavailable. Enter your city instead.':error.message;}
 finally{if(active)locationBusy.value=false;}
}
async function signOut(){if(locked.value)return;try{await logout();await router.replace('/');}catch(error){err.value=error.message;}}
</script>
<template>
 <main class="onboarding">
  <header class="brand"><RouterLink class="brand-lockup" to="/"><img class="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true">Pacemate</RouterLink><button type="button" class="text-button" :disabled="locked" @click="signOut">Log out</button></header>
  <div class="flow">
   <nav class="step-navigation" aria-label="Profile setup"><button type="button" class="text-button" :disabled="step===0||locked" @click="back">Back</button><span>Step {{ step+1 }} of {{ ONBOARDING_STEPS.length }}</span></nav>
   <progress :value="step+1" :max="ONBOARDING_STEPS.length" aria-label="Profile setup progress">{{ step+1 }} of {{ ONBOARDING_STEPS.length }}</progress>
   <form @submit.prevent="next" :aria-busy="busy" novalidate>
    <header class="question"><p v-if="cur.optional" class="optional">Optional</p><h1 ref="title" tabindex="-1">{{ cur.title }}</h1><p v-if="cur.description" class="description">{{ cur.description }}</p></header>
    <fieldset :disabled="locked" class="answer" :aria-label="cur.title">
     <input v-if="cur.key==='name'" v-model="f.name" type="text" maxlength="30" autocomplete="given-name" aria-label="Your name" placeholder="Your first name">
     <input v-else-if="cur.key==='birthdate'" v-model="f.birthdate" type="date" :max="maxBirthdate" autocomplete="bday" aria-label="Date of birth">
     <div v-else-if="cur.key==='gender'" class="options"><button v-for="gender in GENDERS" :key="gender" type="button" :aria-pressed="f.gender===gender" @click="f.gender=gender">{{ gender }}</button></div>
     <div v-else-if="cur.key==='goal'" class="options"><button v-for="goal in GOALS" :key="goal" type="button" :aria-pressed="f.goal===goal" @click="f.goal=goal">{{ goal }}</button></div>
     <div v-else-if="cur.key==='interestedIn'" class="options"><button v-for="gender in GENDERS" :key="gender" type="button" :aria-pressed="f.interestedIn.includes(gender)" @click="toggle(f.interestedIn,gender)">{{ gender }}</button></div>
     <div v-else-if="cur.key==='ages'" class="age-range"><label>From<input v-model.number="f.ageMin" type="number" min="18" max="99" inputmode="numeric"></label><span aria-hidden="true">to</span><label>To<input v-model.number="f.ageMax" type="number" min="18" max="99" inputmode="numeric"></label></div>
     <template v-else-if="cur.key==='sports'"><p class="selection-count" aria-live="polite">{{ f.sports.length }} of 8 selected</p><div class="sports" role="group" aria-label="Sports"><button v-for="sport in SPORTS" :key="sport" type="button" :aria-pressed="f.sports.includes(sport)" :disabled="f.sports.length>=8&&!f.sports.includes(sport)" @click="toggle(f.sports,sport,8)">{{ sport }}</button></div></template>
     <div v-else-if="cur.key==='level'" class="options"><button v-for="level in LEVELS" :key="level" type="button" :aria-pressed="f.level===level" @click="f.level=f.level===level?'':level">{{ level }}</button></div>
     <div v-else-if="cur.key==='routine'" class="options"><button v-for="routine in ROUTINES" :key="routine" type="button" :aria-pressed="f.routine===routine" @click="f.routine=f.routine===routine?'':routine">{{ routine }}</button></div>
     <template v-else-if="cur.key==='city'"><label class="field"><span>Country or territory</span><select v-model="f.countryCode"><option v-for="country in COUNTRIES" :key="country.code" :value="country.code">{{country.name}}</option></select></label><button type="button" class="location-button" :disabled="locked" @click="useLocation">{{ locationBusy?'Finding your city…':'Use my location' }}</button><p class="location-copy">With your permission, we use your location once to suggest a city. Coordinates are not saved to your profile.</p><p v-if="locationNotice" class="location-copy" role="status">{{ locationNotice }}</p><label class="field"><span>Home city</span><input v-model="f.homeCity" type="text" list="onboarding-cities" maxlength="60" autocomplete="address-level2" placeholder="Start typing your city"></label><datalist id="onboarding-cities"><option v-for="city in CITIES" :key="city" :value="city"/></datalist><details><summary>I'm currently in another city</summary><label class="field"><span>Current city</span><input v-model="f.currentCity" type="text" list="onboarding-cities" maxlength="60"></label></details></template>
     <PhotoManager v-else-if="cur.key==='photos'" v-model="f.photos" @busy="photoBusy=$event" class="photos"/>
     <template v-else-if="cur.key==='bio'"><textarea v-model="f.bio" maxlength="500" rows="5" aria-label="About you" placeholder="A little about you"></textarea><p class="character-count">{{ f.bio.length }}/500</p></template>
     <div v-else-if="cur.key==='review'" class="review"><ProfileCard :person="preview"/><button type="button" class="text-button" @click="step=0;err=''">Edit your answers</button></div>
    </fieldset>
    <p v-if="err" class="error" role="alert">{{ err }}</p>
    <footer class="actions"><button type="submit" class="continue" :disabled="locked">{{ busy?'Saving your profile…':photoBusy?'Uploading photos…':cur.key==='review'?'Create profile and discover':'Continue' }}</button><button v-if="cur.optional&&!f[cur.key]?.length" type="button" class="text-button" :disabled="locked" @click="next">Add this later</button></footer>
   </form>
  </div>
 </main>
</template>
<style scoped>
.onboarding{min-height:100svh;background:var(--bg);color:var(--ink);padding:0 24px calc(32px + env(safe-area-inset-bottom,0px))}
.brand{max-width:1040px;margin:0 auto;padding:26px 0;display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand>a{text-decoration:none;font:700 26px var(--display);letter-spacing:-1px}
.text-button{min-height:44px;padding:10px 0;border:0;background:none;color:var(--mute);font:500 13px var(--body);text-decoration:underline;text-underline-offset:4px;cursor:pointer}
button:disabled{opacity:.45;cursor:not-allowed}
.flow{max-width:560px;margin:24px auto 0;min-width:0}
.step-navigation{display:flex;justify-content:space-between;align-items:center;gap:20px;font-size:12px;color:var(--mute)}
progress{appearance:none;-webkit-appearance:none;display:block;width:100%;height:3px;border:0;border-radius:12px;background:var(--line);accent-color:var(--green);margin:8px 0 40px}
progress::-webkit-progress-bar{background:var(--line)}progress::-webkit-progress-value{background:var(--green)}progress::-moz-progress-bar{background:var(--green)}
.question{margin-bottom:30px}.question h1{font:600 clamp(29px,4vw,42px)/1.12 var(--display);letter-spacing:-.035em;margin:0;overflow-wrap:anywhere;outline:none}
.description{font-size:14px;line-height:1.65;color:var(--mute);margin:15px 0 0}.optional{font-size:12px;color:var(--mute);margin:0 0 12px}
.answer{margin:0;padding:0;border:0;min-width:0;min-inline-size:0}
input,textarea{width:100%;min-width:0;min-height:54px;padding:14px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:12px;font:400 16px var(--body);box-sizing:border-box}
input[type=date]{appearance:none;-webkit-appearance:none;min-inline-size:0}input[type=date]::-webkit-date-and-time-value{text-align:left;min-width:0}textarea{resize:vertical;line-height:1.6}
.options{display:grid;gap:10px}.options button,.sports button{border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);text-align:left;font:500 14px var(--body);padding:16px;min-height:52px;cursor:pointer}
.options button[aria-pressed=true],.sports button[aria-pressed=true]{border-color:var(--ink);background:var(--soft);color:var(--ink);font-weight:700;outline:1px solid var(--ink);outline-offset:-2px}
.sports{display:flex;gap:8px;flex-wrap:wrap}.sports button{font-size:13px;min-height:44px;padding:10px 13px}
.selection-count,.character-count{font-size:12px;color:var(--mute);margin:0 0 14px}.character-count{text-align:right;margin:10px 0 0}
.age-range{display:flex;align-items:center;gap:14px}.age-range label{flex:1;min-width:0;font-size:12px;color:var(--mute)}.age-range input{margin-top:8px}.age-range>span{padding-top:21px;color:var(--mute);font-size:13px}
.location-button{width:100%;min-height:48px;border:1px solid var(--ink);border-radius:12px;background:var(--bg);color:var(--ink);font:600 14px var(--body);cursor:pointer}.location-copy{font-size:12px;line-height:1.6;color:var(--mute);margin:12px 0 20px}.field span{font-size:12px;color:var(--mute)}details{margin-top:20px}summary{font-size:13px;color:var(--mute);min-height:44px;cursor:pointer;padding:10px 0}details .field{margin-top:10px}
.actions{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin-top:36px}.continue{width:100%;min-height:52px;padding:14px 20px;border:1px solid var(--cta);border-radius:12px;background:var(--cta);color:var(--on);font:600 14px var(--body);cursor:pointer}
.error{font-size:13px;color:var(--danger);line-height:1.6;margin:20px 0 0}
.review :deep(.ph){aspect-ratio:5/4;max-height:340px}.review :deep(.pc){background:var(--bg)}.review>.text-button{display:block;margin:12px auto 0}.review :deep(.info){padding:20px}.review :deep(.facts){gap:14px}
.photos :deep(li),.photos :deep(.main),.photos :deep(.add label){border-radius:12px}.photos :deep(.add label){color:var(--ink)}
@media(min-width:701px){form{padding-bottom:30px}.answer{min-height:130px}}
@media(max-width:600px){.onboarding{padding-left:20px;padding-right:20px}.brand{padding:16px 0}.brand>a{font-size:24px}.flow{margin-top:12px}progress{margin-bottom:30px}.question{margin-bottom:24px}.question h1{font-size:32px}.actions{margin-top:28px}.review :deep(.ph){max-height:290px}}
</style>

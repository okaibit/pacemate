<script setup>
import {ref,reactive,computed,onMounted,onBeforeUnmount} from 'vue';
import {api} from '../api.js';
import {session,loadProfile} from '../auth.js';
import {foundation} from '../foundation/api.js';
import {MODES,DAYS,TIMES,INTENSITIES,EXPERIENCE,profileCompleteness} from '../foundation/compatibility.js';
import PhotoManager from '../components/PhotoManager.vue';
const f=reactive({name:'',birthdate:'',city:'',country:'',bio:'',languages:[],photos:[],preferred_days:[],preferred_times:[],preferred_intensity:'',lifestyle_interests:[],connection_modes:[],user_sports:[],verification_status:'unverified'});
const catalog=ref([]),loading=ref(true),busy=ref(false),photoBusy=ref(false),error=ref(''),saved=ref(false);
const languages=ref(''),interests=ref('');
const owner=session.user?.id;
let active=true;
onBeforeUnmount(()=>active=false);
const currentOwner=()=>active&&session.user?.id===owner;
const completeness=computed(()=>profileCompleteness({...f,languages:split(languages.value),lifestyle_interests:split(interests.value)}));
const age=computed(()=>{if(!f.birthdate)return null;const now=new Date(),dob=new Date(`${f.birthdate}T00:00:00Z`);return now.getUTCFullYear()-dob.getUTCFullYear()-(now.toISOString().slice(5,10)<f.birthdate.slice(5)?1:0);});
let persistedPhotos=[];
const cleanupWarning=ref('');
const today=new Date().toISOString().slice(0,10);
function split(s){return [...new Set(s.split(',').map(v=>v.trim()).filter(Boolean))];}
function apply(p){persistedPhotos=[...p.photos];Object.assign(f,p);languages.value=p.languages.join(', ');interests.value=p.lifestyle_interests.join(', ');}
function toggle(values,value){const index=values.indexOf(value);index<0?values.push(value):values.splice(index,1);saved.value=false;}
function sportChanged(sport){const index=f.user_sports.findIndex(s=>s.sport_id===sport.id);if(index>=0)f.user_sports.splice(index,1);else if(f.user_sports.length<8)f.user_sports.push({sport_id:sport.id,name:sport.name,experience_level:'',preferred_intensity:''});saved.value=false;}
async function load(){loading.value=true;error.value='';try{const [profile,sports]=await Promise.all([foundation.profile(null,owner),foundation.sports(owner)]);if(!currentOwner())return;if(!profile)throw new Error('Your profile is unavailable.');apply(profile);catalog.value=sports;}catch(e){if(currentOwner())error.value=e.message;}finally{if(currentOwner())loading.value=false;}}
async function save(){if(busy.value||photoBusy.value||!currentOwner())return;busy.value=true;error.value='';saved.value=false;try{
 const payload={...f,languages:split(languages.value),lifestyle_interests:split(interests.value)};
 const before=[...persistedPhotos];
 const result=await foundation.save(payload,owner);if(!currentOwner())return;apply(result);saved.value=true;
 const removed=before.filter(key=>!result.photos.includes(key));
 const cleanups=await Promise.allSettled(removed.map(key=>api('/api/photos/'+key.split('/').map(encodeURIComponent).join('/'),{method:'DELETE',expectedUserId:owner})));
 if(!currentOwner())return;
 cleanupWarning.value=cleanups.some(r=>r.status==='rejected')?'Profile saved. Some removed photo files still need cleanup. Please contact support.':'';
 await loadProfile();
}catch(e){if(currentOwner())error.value=e.message;}finally{if(currentOwner())busy.value=false;}}
onMounted(load);
</script>
<template>
 <main class="foundation">
  <header><div><RouterLink to="/app/profile">Your profile</RouterLink><h1>Make it <em>yours.</em></h1></div><RouterLink v-if="!loading&&!error" :to="'/app/profile/member/'+owner" class="btn ghost sm">Preview</RouterLink></header>
  <p v-if="loading" role="status" aria-live="polite">Loading your profile…</p>
  <div v-else-if="!catalog.length"><p class="err" role="alert">{{error||'No sports are available yet.'}}</p><button class="btn" @click="load">Retry</button></div>
  <form v-else @submit.prevent="save" class="stack">
   <section class="completion"><label for="complete">Profile complete <strong>{{completeness.percent}}%</strong></label><progress id="complete" :value="completeness.percent" max="100">{{completeness.percent}}%</progress></section>
   <fieldset :disabled="busy"><legend>About you</legend>
    <label class="field"><span>Display name</span><input v-model="f.name" required minlength="2" maxlength="30" autocomplete="nickname"></label>
    <label class="field"><span>Date of birth · only you</span><input type="date" v-model="f.birthdate" :max="today" required></label>
    <div class="place"><label class="field"><span>City</span><input v-model="f.city" required maxlength="60" autocomplete="address-level2"></label><label class="field"><span>Country</span><input v-model="f.country" required maxlength="80" autocomplete="country-name"></label></div>
    <label class="field"><span>Bio</span><textarea v-model="f.bio" maxlength="500" rows="4"></textarea></label>
    <label class="field"><span>Languages, separated by commas</span><input v-model="languages" maxlength="600" placeholder="English, French"></label>
    <label class="field"><span>Lifestyle interests, separated by commas</span><input v-model="interests" maxlength="600" placeholder="Reading, cooking"></label>
    <p class="mute small">{{f.verification_status==='verified'?'Photo verified':'Unverified'}}. Other members see your age, never your date of birth.</p>
   </fieldset>
   <fieldset :disabled="busy"><legend>Photos</legend><PhotoManager v-model="f.photos" @busy="photoBusy=$event" /></fieldset>
   <fieldset :disabled="busy"><legend>Open to</legend><div class="choices"><label v-for="(label,mode) in MODES" :key="mode"><input type="checkbox" :checked="f.connection_modes.includes(mode)" :disabled="mode==='dating'&&!(age>=18)" @change="toggle(f.connection_modes,mode)">{{label}}</label></div><p v-if="!(age>=18)" class="mute small">Dating is available from age 18.</p><p v-if="!f.connection_modes.length" class="small">Choose at least one connection mode.</p></fieldset>
   <fieldset :disabled="busy"><legend>Sports</legend><p class="mute small">Choose up to eight.</p><div class="chips"><button v-for="s in catalog" :key="s.id" type="button" class="chip" :aria-pressed="f.user_sports.some(u=>u.sport_id===s.id)" :disabled="f.user_sports.length>=8&&!f.user_sports.some(u=>u.sport_id===s.id)" @click="sportChanged(s)">{{s.name}}</button></div>
    <section v-for="sport in f.user_sports" :key="sport.sport_id" class="sport-detail"><h3>{{sport.name}}</h3><div class="place"><label class="field"><span>Experience</span><select v-model="sport.experience_level" required><option value="" disabled>Choose</option><option v-for="v in EXPERIENCE" :key="v" :value="v">{{v}}</option></select></label><label class="field"><span>Intensity</span><select v-model="sport.preferred_intensity" required><option value="" disabled>Choose</option><option v-for="v in INTENSITIES" :key="v" :value="v">{{v}}</option></select></label></div></section>
   </fieldset>
   <fieldset :disabled="busy"><legend>Your rhythm</legend><p class="lbl">Preferred days</p><div class="choices"><label v-for="day in DAYS" :key="day"><input type="checkbox" :checked="f.preferred_days.includes(day)" @change="toggle(f.preferred_days,day)">{{day}}</label></div><p class="lbl">Preferred times</p><div class="choices"><label v-for="time in TIMES" :key="time"><input type="checkbox" :checked="f.preferred_times.includes(time)" @change="toggle(f.preferred_times,time)">{{time}}</label></div><label class="field"><span>Overall intensity</span><select v-model="f.preferred_intensity"><option value="">Choose</option><option v-for="v in INTENSITIES" :key="v" :value="v">{{v}}</option></select></label></fieldset>
   <p v-if="error" class="err" role="alert">{{error}}</p><p v-if="saved" class="ok" role="status">Saved.</p><p v-if="cleanupWarning" role="status">{{cleanupWarning}}</p><button class="btn block" :disabled="busy||photoBusy||!f.connection_modes.length||!f.user_sports.length">{{busy?'Saving…':photoBusy?'Uploading…':'Save profile'}}</button>
  </form>
 </main>
</template>
<style scoped>
.foundation{max-width:760px;min-width:0;margin:auto}header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:28px}h1{font:600 clamp(30px,6vw,46px)/1.1 var(--display);margin:12px 0}em{font-family:Georgia,serif;color:var(--coral)}fieldset{border:0;border-top:1px solid var(--line);padding:24px 0;margin:0;min-width:0}legend{font:600 22px var(--display);padding-right:16px}.place{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}.field input,.field select{min-width:0;max-width:100%}.choices{display:flex;gap:14px 22px;flex-wrap:wrap;margin:12px 0 20px}.choices label{display:flex;align-items:center;gap:9px;min-height:44px}.choices input{width:20px;height:20px;accent-color:var(--green)}.completion label{display:flex;justify-content:space-between}progress{width:100%;height:8px;accent-color:var(--green);margin-top:12px}.sport-detail{border-top:1px solid var(--line);margin-top:20px;padding-top:20px}.sport-detail h3{margin:0 0 12px}.lbl{font-weight:700}button.chip{border-radius:0}.stack{gap:16px}@media(min-width:600px){.place{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>

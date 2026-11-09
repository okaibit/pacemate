<script setup>
import {ref,reactive,computed,onMounted,watch} from 'vue';
import {api,formatEventTime} from '../api.js';
import {session} from '../auth.js';
import {EVENT_KINDS,CITIES,REGIONS,regionOf} from '../options.js';
import Avatar from '../components/Avatar.vue';

const list=ref([]),cities=ref([]),city=ref(''),region=ref(''),loading=ref(true),error=ref(''),creating=ref(false),busy=ref(false),formError=ref(''),editing=ref(null),hasMore=ref(false),pending=ref(new Set());
const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
const blank=()=>({title:'',kind:'Run',city:session.profile.currentCity,location:'',startsAt:'',weekly:false,capacity:'',description:''});
const f=reactive(blank());let sequence=0,initialized=false;
async function load(append=false){
  const token=++sequence;loading.value=true;error.value='';
  try{
    const params=new URLSearchParams({city:city.value,region:region.value,offset:String(append?list.value.length:0)});
    const r=await api('/api/events?'+params);
    if(token!==sequence)return;
    cities.value=r.cities;hasMore.value=r.hasMore;list.value=append?[...list.value,...r.events]:r.events;
  }catch(e){if(token===sequence)error.value=e.message;}finally{if(token===sequence)loading.value=false;}
}
onMounted(()=>{initialized=true;load();});
watch([city,region],()=>{if(initialized)load();});
const regions=computed(()=>[...Object.keys(REGIONS),'Other'].filter(r=>cities.value.some(c=>regionOf(c)===r)));
const regionCities=computed(()=>cities.value.filter(c=>!region.value||regionOf(c)===region.value));
function start(){editing.value=null;Object.assign(f,blank());creating.value=true;formError.value='';}
function edit(e){editing.value=e.id;const d=new Date(e.startsAt);Object.assign(f,{title:e.title,kind:e.kind,city:e.city,location:e.location,startsAt:new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16),weekly:e.weekly,capacity:e.capacity||'',description:e.description});creating.value=true;formError.value='';window.scrollTo({top:0,behavior:'smooth'});}
async function save(){
  if(busy.value)return;busy.value=true;formError.value='';
  try{
    const when=new Date(f.startsAt);if(!Number.isFinite(+when))throw new Error('Choose a start time.');
    await api('/api/events'+(editing.value?'/'+editing.value:''),{method:editing.value?'PUT':'POST',body:{...f,startsAt:when.toISOString(),timezone:tz}});
    creating.value=false;await load();
  }catch(e){formError.value=e.message;}finally{busy.value=false;}
}
async function rsvp(e){
  if(pending.value.has(e.id))return;pending.value.add(e.id);error.value='';
  try{const r=await api(`/api/events/${e.id}/rsvp`,{method:'POST',body:{going:!e.mine}});e.mine=r.going;e.going=r.count;const me={id:session.profile.id,name:session.profile.name,photo:session.profile.photos?.[0]};e.attendees=e.attendees.filter(a=>a.id!==me.id);if(r.going)e.attendees.push(me);}
  catch(x){error.value=x.message;}finally{pending.value.delete(e.id);}
}
async function cancel(e){if(!confirm(`Cancel “${e.title}” and notify attendees?`))return;pending.value.add(e.id);try{await api(`/api/events/${e.id}`,{method:'DELETE'});await load();}catch(x){error.value=x.message;}finally{pending.value.delete(e.id);}}
const time=e=>formatEventTime(e.startsAt,e.timezone);
</script>
<template>
  <div class="sessions-page"><div class="row heading"><h1>Sessions</h1><button class="btn sm" @click="creating?creating=false:start()">{{ creating?'Close':'+ Host' }}</button></div>
    <form v-if="creating" class="card stack session-form" @submit.prevent="save"><h2>{{ editing?'Edit session':'Host a session' }}</h2><label class="field"><span>Title</span><input v-model="f.title" maxlength="80" required></label><div class="row"><label class="field grow"><span>Activity</span><select v-model="f.kind"><option v-for="kind in EVENT_KINDS" :key="kind">{{ kind }}</option></select></label><label class="field grow"><span>City</span><input v-model="f.city" list="event-cities" maxlength="60" required></label></div><datalist id="event-cities"><option v-for="c in CITIES" :key="c" :value="c"/></datalist><label class="field"><span>Meeting point</span><input v-model="f.location" maxlength="120" required></label><div class="row"><label class="field grow"><span>Starts · {{ tz }}</span><input v-model="f.startsAt" type="datetime-local" required></label><label class="field" style="width:130px"><span>Capacity</span><input v-model="f.capacity" type="number" min="2" max="500" placeholder="No limit"></label></div><label class="row"><input v-model="f.weekly" type="checkbox"> Repeat weekly</label><label class="field"><span>Details</span><textarea v-model="f.description" maxlength="1000"></textarea></label><p v-if="formError" class="err" role="alert">{{ formError }}</p><button class="btn" :disabled="busy">{{ busy?'Saving…':editing?'Save changes':'Publish' }}</button></form>
    <div class="chips filters"><button class="chip" :aria-pressed="!region" @click="region='';city=''">Worldwide</button><button v-for="r in regions" :key="r" class="chip" :aria-pressed="region===r" @click="region=r;city=''">{{ r }}</button></div><select v-model="city" aria-label="Filter by city" class="city"><option value="">All cities</option><option v-for="c in regionCities" :key="c">{{ c }}</option></select>
    <p v-if="error" class="err" role="alert">{{ error }}</p><div v-if="loading&&!list.length"  class="spinner"></div><div v-else-if="!list.length" class="card"><p>No sessions here yet.</p><button class="btn sm" @click="start">Host a session</button></div>
    <ul class="sessions"><li v-for="e in list" :key="e.id" class="card event"><div class="when"><b>{{ time(e).day }}</b><span>{{ time(e).time }}</span></div><div class="grow"><div class="row"><span class="tag hot">{{ e.kind }}</span><span v-if="e.weekly" class="tag">Weekly</span></div><h2>{{ e.title }}</h2><p class="mute small">{{ e.city }} · {{ e.location }}</p><p v-if="e.description" class="details">{{ e.description }}</p><div class="row"><div class="faces"><Avatar v-for="a in e.attendees" :key="a.id" :person="a" :size="28"/></div><span class="mute small">{{ e.going }} going<span v-if="e.capacity"> · {{ Math.max(0,e.capacity-e.going) }} places left</span></span></div><div class="row actions"><button class="btn sm" :class="{ghost:e.mine}" :disabled="pending.has(e.id)||(!e.mine&&e.capacity&&e.going>=e.capacity)" @click="rsvp(e)">{{ e.mine?'Leave':e.capacity&&e.going>=e.capacity?'Full':'Join' }}</button><RouterLink v-if="e.mine||e.isHost" class="btn ghost sm" :to="`/app/events/${e.id}/chat`">Chat</RouterLink><button v-if="e.isHost" class="link small" @click="edit(e)">Edit</button><button v-if="e.isHost" class="link small danger" :disabled="pending.has(e.id)" @click="cancel(e)">Cancel session</button></div></div></li></ul><button v-if="hasMore" class="btn ghost block" :disabled="loading" @click="load(true)">{{ loading?'Loading…':'More sessions' }}</button>
  </div>
</template>
<style scoped>.sessions-page{padding-bottom:128px}.heading{justify-content:space-between;margin-bottom:16px}h1{font-size:30px}h2{font-size:21px;margin:10px 0 6px}.session-form{margin-bottom:20px}.filters{margin-bottom:12px}.city{max-width:280px;margin-bottom:16px}.sessions{list-style:none;margin:0;padding:0;display:grid;gap:12px}.event{display:flex;gap:16px}.when{width:75px;flex:none}.when b,.when span{display:block}.when span{color:var(--mute)}.event .grow{min-width:0}.event p{margin:5px 0}.details{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}.faces{display:flex}.faces>*{margin-right:-6px;border:2px solid var(--card)}.actions{margin-top:14px}.danger{color:var(--danger)}input[type=checkbox]{width:20px;height:20px}</style>

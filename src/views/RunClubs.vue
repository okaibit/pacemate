<script setup>
import {ref,reactive,onMounted} from 'vue';
import {api} from '../api.js';
import {session} from '../auth.js';

const clubs=ref([]),loading=ref(true),busy=ref(false),error=ref(''),notice=ref(''),creating=ref(false);
const form=reactive({name:'',city:session.profile?.currentCity||'',description:''});
async function load(){loading.value=true;error.value='';try{const result=await api('/api/clubs');clubs.value=result.clubs||[];}catch(e){error.value=e.message;}finally{loading.value=false;}}
async function create(){if(busy.value)return;busy.value=true;error.value='';notice.value='';try{const result=await api('/api/clubs',{method:'POST',body:{...form}});creating.value=false;form.name='';form.description='';notice.value='Your run club is live. Add its first run from Sessions.';await load();}catch(e){error.value=e.message;}finally{busy.value=false;}}
onMounted(load);
</script>
<template>
 <main class="run-clubs">
  <header class="row heading"><div><RouterLink to="/app/events">Sessions</RouterLink><h1>Run clubs</h1><p class="mute">Local organizers, regular runs, and a chat for the people who join.</p></div><button class="btn sm" @click="creating=!creating">{{creating?'Close':'Start a club'}}</button></header>
  <form v-if="creating" class="card stack create-form" @submit.prevent="create"><h2>Start a run club</h2><label class="field"><span>Club name</span><input v-model="form.name" maxlength="80" minlength="3" required placeholder="Saturday Lagos Runners"></label><label class="field"><span>City</span><input v-model="form.city" maxlength="60" required></label><label class="field"><span>About the club</span><textarea v-model="form.description" maxlength="1000" rows="3" placeholder="Who the runs are for and what to expect"></textarea></label><p class="mute small">You’ll be the organizer. Your club chat is for members; each run keeps its own RSVP list.</p><button class="btn" :disabled="busy">{{busy?'Creating…':'Create run club'}}</button></form>
  <p v-if="error" class="err" role="alert">{{error}}</p><p v-if="notice" class="ok" role="status">{{notice}}</p>
  <p v-if="loading" role="status" class="mute">Loading run clubs…</p><section v-else-if="!clubs.length" class="card empty"><h2>No run clubs here yet</h2><p class="mute">Start one for your city, then add regular runs for members to join.</p><button class="btn sm" @click="creating=true">Start a club</button></section>
  <ul v-else class="clubs"><li v-for="club in clubs" :key="club.id" class="card club"><div><span class="tag">{{club.city}}</span><h2>{{club.name}}</h2><p v-if="club.description" class="description">{{club.description}}</p><p class="mute small">Organized by {{club.organizer_name}} · {{club.members}} members · {{club.upcoming_runs}} upcoming runs</p></div><RouterLink class="btn ghost sm" :to="`/app/run-clubs/${club.id}`">View club</RouterLink></li></ul>
 </main>
</template>
<style scoped>
.heading{justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:22px}.heading h1{font-size:30px;margin:8px 0}.heading p{margin:0;max-width:520px;line-height:1.5}.create-form{margin-bottom:18px}.clubs{list-style:none;margin:0;padding:0;display:grid;gap:12px}.club{display:flex;justify-content:space-between;align-items:center;gap:18px}.club h2,.empty h2{font-size:21px;margin:10px 0 6px}.club p{margin:6px 0}.description{white-space:pre-wrap;overflow-wrap:anywhere}.empty{padding:22px}.empty p{line-height:1.55}
</style>

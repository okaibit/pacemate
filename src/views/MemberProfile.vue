<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import {useRoute} from 'vue-router';
import {session} from '../auth.js';
import {foundation} from '../foundation/api.js';
import {MODES,computeCompatibility} from '../foundation/compatibility.js';
import {photoUrl} from '../api.js';
const route=useRoute(),profile=ref(null),viewer=ref(null),loading=ref(true),error=ref('');
let sequence=0;
onBeforeUnmount(()=>sequence++);
const compatibility=computed(()=>profile.value&&viewer.value?computeCompatibility(viewer.value,profile.value):null);
async function load(){const request=++sequence,owner=session.user?.id;loading.value=true;error.value='';profile.value=null;viewer.value=null;try{const [a,b]=await Promise.all([foundation.profile(null,owner),foundation.profile(String(route.params.id),owner)]);if(request!==sequence||session.user?.id!==owner)return;viewer.value=a;profile.value=b;}catch(e){if(request===sequence)error.value=e.message;}finally{if(request===sequence)loading.value=false;}}
watch(()=>route.params.id,load,{immediate:true});
</script>
<template>
 <article class="member">
  <RouterLink to="/app/profile">Your profile</RouterLink>
  <p v-if="loading" role="status">Loading profile…</p>
  <div v-else-if="error"><p class="err" role="alert">{{error}}</p><button class="btn" @click="load">Retry</button></div>
  <p v-else-if="!profile">This profile is unavailable.</p>
  <template v-else>
   <header><img v-if="profile.photos[0]" :src="photoUrl(profile.photos[0])" :alt="profile.name" class="portrait"><h1>{{profile.name}}, {{profile.age}}</h1><p>{{[profile.city,profile.country].filter(Boolean).join(', ')}}</p><p v-if="profile.verification_status==='verified'">Photo verified</p></header>
   <div class="chips"><span v-for="mode in profile.connection_modes" :key="mode" class="mode">{{MODES[mode]}}</span></div>
   <p class="bio">{{profile.bio}}</p>
   <section><h2>Sports</h2><p v-for="sport in profile.user_sports" :key="sport.sport_id">{{sport.name}}<template v-if="sport.experience_level"> · {{sport.experience_level}}</template><template v-if="sport.preferred_intensity"> · {{sport.preferred_intensity}} intensity</template></p></section>
   <section><h2>Your rhythm</h2><p>{{profile.preferred_days.join(', ')||'Days not added'}}</p><p>{{profile.preferred_times.join(', ')||'Times not added'}}</p><p v-if="profile.preferred_intensity">{{profile.preferred_intensity}} intensity</p></section>
   <section v-if="profile.languages.length"><h2>Languages</h2><p>{{profile.languages.join(', ')}}</p></section>
   <section v-if="profile.lifestyle_interests.length"><h2>Beyond sport</h2><p>{{profile.lifestyle_interests.join(', ')}}</p></section>
   <section v-if="profile.id!==viewer?.id&&compatibility"><h2>Your compatibility</h2><template v-if="compatibility.eligible"><p class="score">{{compatibility.score}}<span>/100</span></p><ul><li v-for="reason in compatibility.reasons" :key="reason">{{reason}}</li></ul></template><p v-else>You do not share a connection mode.</p></section>
  </template>
 </article>
</template>
<style scoped>
.member{max-width:700px;margin:auto;overflow-wrap:anywhere}.portrait{display:block;width:100%;max-height:480px;object-fit:cover;margin:24px 0}h1{font:600 clamp(32px,6vw,48px) var(--display);margin-top:24px}h2{font:600 24px var(--display)}section{border-top:1px solid var(--line);padding:24px 0}.mode{padding:8px 12px;border:1px solid var(--line)}.bio{white-space:pre-line;font:24px/1.5 Georgia,serif;margin:30px 0}.score{font:600 56px var(--display);color:var(--green);margin:12px 0}.score span{font-size:20px;color:var(--mute)}li{margin:12px 0}
</style>

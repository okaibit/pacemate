<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {foundationRpc} from '../foundation/api.js';
import {profileCompleteness,MODES} from '../foundation/compatibility.js';
import {session} from '../auth.js';
const profile=ref(null),percent=ref(0),loading=ref(true),error=ref('');
let active=true;
onBeforeUnmount(()=>active=false);
async function load(){const owner=session.user?.id;loading.value=true;error.value='';try{const p=await foundationRpc('foundation_profile',{},owner);if(active&&owner===session.user?.id){profile.value=p;percent.value=profileCompleteness(p).percent;}}catch(e){if(active)error.value=e.message;}finally{if(active)loading.value=false;}}
onMounted(load);
</script>
<template><section class="foundation-summary"><p v-if="loading" role="status">Loading profile completeness…</p><template v-else-if="profile"><label for="profile-progress">Profile complete · {{percent}}%</label><progress id="profile-progress" :value="percent" max="100">{{percent}}%</progress><p>{{profile.connection_modes.map(m=>MODES[m]).join(' · ')}}</p></template><p v-if="error" class="mute small" role="status">{{error}} <button type="button" class="link" @click="load">Retry</button></p><RouterLink class="btn ghost" to="/app/profile/edit">Edit full profile</RouterLink></section></template>
<style scoped>.foundation-summary{border-block:1px solid var(--line);padding:20px 0;margin:20px 0}progress{display:block;width:100%;height:8px;margin-top:12px;accent-color:var(--green)}</style>

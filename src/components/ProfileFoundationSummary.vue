<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {foundation} from '../foundation/api.js';
import {profileCompleteness,MODES} from '../foundation/compatibility.js';
import {session} from '../auth.js';
const profile=ref(null),percent=ref(0),loading=ref(true),error=ref('');
let active=true;
onBeforeUnmount(()=>active=false);
async function load(){const owner=session.user?.id;loading.value=true;error.value='';try{const p=await foundation.profile(null,owner);if(active&&owner===session.user?.id){profile.value=p;percent.value=profileCompleteness(p).percent;}}catch(e){if(active)error.value=e.message;}finally{if(active)loading.value=false;}}
onMounted(load);
</script>
<template><section class="foundation-summary"><p v-if="loading" role="status">Loading profile completeness…</p><template v-else-if="profile"><div class="completion-row"><label for="profile-progress">{{percent}}% complete</label><RouterLink class="complete-link" to="/app/profile/edit">Complete profile <span aria-hidden="true">&gt;</span></RouterLink></div><progress id="profile-progress" :value="percent" max="100">{{percent}}%</progress><p>{{profile.connection_modes.map(m=>MODES[m]).join(' · ')}}</p></template><p v-if="error" class="mute small" role="status">{{error}} <button type="button" class="link" @click="load">Retry</button></p><RouterLink v-if="!profile" class="complete-link" to="/app/profile/edit">Complete profile <span aria-hidden="true">&gt;</span></RouterLink></section></template>
<style scoped>
.foundation-summary{margin:0;font-size:12px}.foundation-summary>p{margin:8px 0;color:var(--mute);font-size:11px}.foundation-summary label{font-weight:600;color:var(--mute)}progress{appearance:none;-webkit-appearance:none;display:block;width:100%;height:4px;margin:10px 0 12px;border:0;border-radius:999px;overflow:hidden;background:var(--line);accent-color:var(--coral)}progress::-webkit-progress-bar{border-radius:999px;background:var(--line)}progress::-webkit-progress-value{border-radius:999px;background:var(--coral)}progress::-moz-progress-bar{border-radius:999px;background:var(--coral)}.complete-link{display:inline-flex;align-items:center;min-height:32px;font-size:11px;text-underline-offset:3px}
</style>

<style scoped>
.completion-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.complete-link{min-height:44px;gap:6px;border-radius:4px}.complete-link:hover,.complete-link:active{color:var(--green);background:var(--soft)}.complete-link:focus-visible{outline:2px solid var(--green);outline-offset:3px}.completion-row+progress{margin-top:0}
</style>

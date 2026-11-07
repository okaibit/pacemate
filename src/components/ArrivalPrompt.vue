<script setup>
import {ref} from 'vue';
import {session,loadProfile} from '../auth.js';
import {api} from '../api.js';
const busy=ref(false),error=ref('');
async function respond(arrived){busy.value=true;error.value='';try{await api('/api/trips/'+(arrived?'arrive':'dismiss'),{method:'POST',body:{}});await loadProfile();}catch(e){error.value=e.message;}finally{busy.value=false;}}
</script>
<template><section v-if="session.profile?.arrival" class="card arrival"><div><b>Arrived in {{ session.profile.arrival.city }}?</b><p v-if="error" class="err" role="alert">{{ error }}</p></div><button class="btn sm" :disabled="busy" @click="respond(true)">Update city</button><button class="link small" :disabled="busy" @click="respond(false)">Dismiss</button></section></template>
<style scoped>.arrival{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}.arrival>div{flex:1;min-width:170px}</style>

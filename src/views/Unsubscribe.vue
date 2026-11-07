<script setup>
import {ref} from 'vue';
import {useRoute} from 'vue-router';
import {api} from '../api.js';
const token=useRoute().query.token,busy=ref(false),done=ref(false),error=ref('');
async function unsubscribe(){busy.value=true;try{await api('/api/notifications/unsubscribe',{method:'POST',body:{token}});done.value=true;}catch(e){error.value=e.message;}finally{busy.value=false;}}
</script>
<template><main class="narrow" style="padding-top:60px"><h1>{{ done?'Unsubscribed':'Email notifications' }}</h1><p v-if="done">You can turn email notifications back on in Settings.</p><p v-if="error" class="err" role="alert">{{ error }}</p><button v-if="!done" class="btn" style="margin-top:20px" :disabled="busy" @click="unsubscribe">Unsubscribe</button><RouterLink v-else class="btn ghost" to="/">Pacemate</RouterLink></main></template>

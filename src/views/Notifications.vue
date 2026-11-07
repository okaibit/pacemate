<script setup>
import {ref,onMounted} from 'vue';
import {api} from '../api.js';
import {internalHref} from '../../supabase/functions/pacemate/server/validation.js';
const items=ref([]),hasMore=ref(false),loading=ref(false),error=ref('');
async function load(append=false){loading.value=true;try{const r=await api('/api/notifications'+(append?'?before='+items.value.at(-1).id:''));items.value=append?[...items.value,...r.items]:r.items;hasMore.value=r.hasMore;error.value='';}catch(e){error.value=e.message;}finally{loading.value=false;}}
async function read(item){try{await api('/api/notifications',{method:'PUT',body:{id:item.id}});item.readAt=new Date().toISOString();}catch(e){error.value=e.message;}}
async function all(){try{await api('/api/notifications',{method:'PUT',body:{all:true}});items.value.forEach(item=>item.readAt=new Date().toISOString());}catch(e){error.value=e.message;}}
onMounted(()=>load());
</script>
<template><div><div class="row heading"><h1>Notifications</h1><button v-if="items.some(item=>!item.readAt)" class="link small" @click="all">Mark all read</button></div><p v-if="error" class="err" role="alert">{{ error }}</p><div v-if="loading&&!items.length" class="spinner"></div><p v-else-if="!items.length" class="mute">You’re up to date.</p><ul class="list"><li v-for="item in items" :key="item.id"><RouterLink class="card notification" :class="{unread:!item.readAt}" :to="internalHref(item.href)" @click="read(item)"><div><b>{{ item.title }}</b><p v-if="item.body">{{ item.body }}</p><time>{{ new Date(item.createdAt).toLocaleString() }}</time></div><span aria-hidden="true">→</span></RouterLink></li></ul><button v-if="hasMore" class="btn ghost block" :disabled="loading" @click="load(true)">Load more</button></div></template>
<style scoped>h1{font-size:30px}.heading{justify-content:space-between;margin-bottom:18px}.list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.notification{display:flex;justify-content:space-between;gap:16px;text-decoration:none}.notification.unread{border-left:4px solid var(--green)}.notification p{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}.notification time{font-size:12px;color:var(--mute)}</style>

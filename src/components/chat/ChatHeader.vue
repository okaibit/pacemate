<script setup>
import Avatar from '../Avatar.vue';
import ChatIcon from './ChatIcon.vue';
defineProps({person:Object,unread:{type:Number,default:0}});
defineEmits(['profile','safety']);
</script>
<template><header class="chat-header"><RouterLink to="/app/matches" class="back pill" :aria-label="`Back to matches, ${unread} unread`"><ChatIcon name="back"/><span v-if="unread">{{ unread>99?'99+':unread }}</span></RouterLink><button class="person" @click="$emit('profile')" :disabled="!person"><Avatar :person="person" :size="38"/><b>{{ person?.name || 'Chat' }}</b></button><div class="pill calls"><button disabled aria-label="Video calling unavailable" title="Video calling is not available"><ChatIcon name="video"/></button><button disabled aria-label="Voice calling unavailable" title="Voice calling is not available"><ChatIcon name="phone"/></button></div><button aria-label="Safety options" @click="$emit('safety')" :disabled="!person"><ChatIcon name="more"/></button></header></template>
<style scoped>
.chat-header{display:flex;align-items:center;gap:8px;background:#111b21;padding:12px 10px;padding-top:calc(12px + env(safe-area-inset-top,0px));color:#e9edef;flex:none}.chat-header button,.back{color:inherit;border:0;background:none;cursor:pointer;padding:5px;display:flex;align-items:center;justify-content:center}.pill{background:#202c33!important;border-radius:12px;display:flex;align-items:center;padding:4px!important}.back{gap:2px;min-width:38px;text-decoration:none;font-size:13px}.person{flex:1;min-width:0;gap:9px;justify-content:flex-start!important}.person b{font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.calls{gap:8px;padding:3px 8px!important}.calls button:disabled{opacity:.45;cursor:not-allowed}
</style>


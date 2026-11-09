<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {bindChatViewport} from '../chat-viewport.js';
import {useChat} from '../composables/useChat.js';
import ChatHeader from '../components/chat/ChatHeader.vue';
import MessageList from '../components/chat/MessageList.vue';
import ChatInput from '../components/chat/ChatInput.vue';
import Modal from '../components/Modal.vue';
import ProfileCard from '../components/ProfileCard.vue';
import ReportDialog from '../components/ReportDialog.vue';
const route=useRoute(),router=useRouter(),mock=import.meta.env.DEV&&route.query.preview==='1';
const {muted,toggleMute,me,other,messages,unread,error,loading,hasOlder,ready,older,send,markRead,react,retry,unmatch}=useChat(route.params.id,{mock});
const chatRoot=ref(null);let releaseViewport;
onMounted(()=>{releaseViewport=bindChatViewport(chatRoot.value);});
onBeforeUnmount(()=>releaseViewport?.());
const text=ref(''),file=ref(null),preview=ref(''),profile=ref(false),safety=ref(false),image=ref(null),confirm=ref(false);
function clearFile(){if(preview.value)URL.revokeObjectURL(preview.value);preview.value='';file.value=null;}
function choose(value){clearFile();if(!value.type.startsWith('image/')){error.value='Choose an image.';return;}if(value.size>20*1024*1024){error.value='Choose a photo smaller than 20 MB.';return;}file.value=value;preview.value=URL.createObjectURL(value);}
function submit(){if(send(text.value,file.value)){text.value='';clearFile();}}
async function forward(message){try{if(navigator.share)await navigator.share({url:message.link_url});else{await navigator.clipboard.writeText(message.link_url);error.value='Link copied.';}}catch(e){if(e.name!=='AbortError')error.value='Could not share this link.';}}
async function remove(){try{await unmatch();router.replace('/app/matches');}catch(e){error.value=e.message;}}
onBeforeUnmount(clearFile);
</script>
<template><section ref="chatRoot" class="chat-view" aria-label="Direct chat"><ChatHeader :person="other" :unread="unread" @profile="profile=true" @safety="safety=true"/><button class="link small" :disabled="!ready" :aria-pressed="muted" @click="toggleMute">{{ muted?'Unmute conversation':'Mute conversation' }}</button><MessageList :messages="messages" :me="me" :loading="loading" :has-older="hasOlder" @older="older" @visible="markRead" @react="react" @forward="forward" @retry="retry" @image="image=$event"/><div v-if="error" class="chat-error" role="status"><span>{{ error }}</span><button aria-label="Dismiss message" @click="error=''">×</button></div><ChatInput v-model="text" :disabled="!ready&&!mock" :preview="preview" @send="submit" @file="choose" @clear="clearFile"/><Modal v-if="profile&&other" :label="other.name+' profile'" flush @close="profile=false"><ProfileCard :person="other"><button class="btn danger block" @click="confirm?remove():confirm=true">{{ confirm?'Confirm unmatch':'Unmatch' }}</button><button class="btn ghost block" @click="profile=false;confirm=false">Close</button></ProfileCard></Modal><Modal v-if="image" label="Shared photo" @close="image=null"><img :src="image" alt="Shared photo"><button class="btn block" @click="image=null">Close</button></Modal><ReportDialog v-if="safety&&other" :person="other" @close="safety=false" @done="router.replace('/app/matches')"/></section></template>
<style scoped>
.chat-view{position:fixed;top:var(--chat-top,0px);left:0;right:0;bottom:auto;margin:0 auto;width:100%;max-width:430px;height:var(--chat-height,100dvh);display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--ink);z-index:30;font-family:Arial,Helvetica,sans-serif;color-scheme:inherit}.chat-view :deep(button:focus-visible),.chat-view :deep(a:focus-visible){outline:2px solid var(--green);outline-offset:2px}.chat-error{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;gap:10px;background:var(--soft);font-size:12px;flex:none}.chat-error button{background:none;border:0;color:var(--ink);font-size:20px;cursor:pointer}@media(min-width:431px){.chat-view{}}
</style>


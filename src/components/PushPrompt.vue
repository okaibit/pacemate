<script setup>
import {watch} from 'vue';
import {usePush} from '../composables/usePush.js';
const {showPrompt,needsHomeScreen,error,busy,enable,dismiss,markShown}=usePush();
watch(showPrompt,visible=>{if(visible)markShown();},{immediate:true});
</script>
<template><aside v-if="showPrompt" class="card push-prompt" aria-label="Message and match notifications"><p>Get notified about messages and new matches</p><p v-if="needsHomeScreen">On iOS 16.4+, open Safari’s Share menu and tap Add to Home Screen, then open Pacemate from there.</p><button v-else class="btn sm" :disabled="busy" @click="enable">Enable</button> <button class="btn ghost sm" @click="dismiss">Not now</button><p v-if="error" role="alert">{{ error }}</p></aside></template>
<style scoped>.push-prompt{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);width:min(92vw,400px);z-index:60;}.push-prompt p{margin-bottom:12px}</style>

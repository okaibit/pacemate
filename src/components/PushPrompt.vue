<script setup>
import {usePush} from '../composables/usePush.js';
const {showPrompt,needsHomeScreen,error,busy,enable,dismiss}=usePush();
</script>
<template><aside v-if="showPrompt" class="card push-prompt" aria-label="Message notifications"><p>Get notified when someone messages you</p><p v-if="needsHomeScreen">On iOS 16.4+, open Safari’s Share menu and tap Add to Home Screen, then open Pacemate from there.</p><button v-else class="btn sm" :disabled="busy" @click="enable">Enable</button> <button class="btn ghost sm" @click="dismiss">Not now</button><p v-if="error" role="alert">{{ error }}</p></aside></template>
<style scoped>.push-prompt{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);width:min(92vw,400px);z-index:60;}.push-prompt p{margin-bottom:12px}</style>

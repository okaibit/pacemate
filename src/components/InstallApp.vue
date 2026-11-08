<script setup>
import {ref} from 'vue';
import {appInstalled,appleMobile,installAvailable,installBusy,installApp} from '../pwa.js';
const expanded=ref(false),error=ref('');
async function install(){
 error.value='';
 if(!installAvailable.value){expanded.value=!expanded.value;return;}
 try{const choice=await installApp();if(choice?.outcome!=='accepted')expanded.value=true;}
 catch{error.value='Could not open installation. Use your browser’s install menu.';expanded.value=true;}
}
</script>
<template>
 <section v-if="!appInstalled" id="install-app" class="card install-app">
  <h2>Pacemate on your home screen</h2>
  <p>Open Pacemate like an app, straight from your home screen.</p>
  <button type="button" class="btn ghost sm" :disabled="installBusy" :aria-expanded="expanded" aria-controls="install-instructions" @click="install">{{installBusy?'Opening…':installAvailable?'Install app':'How to install'}}</button>
  <div v-show="expanded" id="install-instructions" class="install-instructions">
   <template v-if="appleMobile"><p>On iPhone or iPad:</p><ol><li>Open this page in Safari.</li><li>Tap Share, then Add to Home Screen.</li><li>If shown, enable Open as Web App, then tap Add.</li></ol></template>
   <template v-else><p>Open your browser’s menu and choose Install app or Add to Home Screen. On a Mac, Safari offers Add to Dock in the File menu.</p><p>If installation isn’t offered, try opening this page directly in Chrome, Edge or Safari.</p></template>
   <p>You’ll need a connection for profiles, messages and account updates.</p>
  </div>
  <p v-if="error" class="err" role="alert">{{error}}</p>
 </section>
</template>
<style scoped>
.install-app{scroll-margin-top:110px}.install-app h2{font:600 22px var(--display);letter-spacing:-.025em;margin:0 0 12px}.install-app p,.install-app li{font-size:13px;line-height:1.7;color:var(--mute)}.install-app>p{margin:0 0 18px}.install-instructions{margin-top:18px}.install-instructions p{margin:12px 0}.install-instructions ol{padding-left:22px;margin:10px 0}.install-instructions li+li{margin-top:8px}
</style>

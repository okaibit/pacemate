<script setup>
import {ref,onMounted,onBeforeUnmount,nextTick} from 'vue';
defineProps({label:{type:String,required:true},flush:Boolean,plain:Boolean});
const emit=defineEmits(['close']);
const panel=ref(null);let previous,overflow;
const focusables=()=>[...panel.value.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select,textarea,[tabindex="0"]')].filter(el=>el.getClientRects().length);
function key(event){
  if(event.key==='Escape'){event.preventDefault();emit('close');}
  if(event.key==='Tab'){
    const elements=focusables(),first=elements[0],last=elements.at(-1);
    if(!first){event.preventDefault();panel.value.focus();return;}
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
}
function focus(event){if(panel.value&&!panel.value.contains(event.target))panel.value.focus();}
onMounted(async()=>{previous=document.activeElement;overflow=document.body.style.overflow;document.body.style.overflow='hidden';await nextTick();(focusables()[0]||panel.value).focus();document.addEventListener('keydown',key);document.addEventListener('focusin',focus);});
onBeforeUnmount(()=>{document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);document.body.style.overflow=overflow;previous?.focus();});
</script>
<template><Teleport to="body"><div class="backdrop" @click.self="emit('close')"><div ref="panel" class="modal" :class="{flush,plain}" role="dialog" aria-modal="true" :aria-label="label" tabindex="-1"><slot/></div></div></Teleport></template>

<style scoped>.flush{padding:0}.plain{width:calc(100% - 32px);max-width:440px;border-radius:24px;background:var(--bg);box-shadow:none}</style>

<script setup>
import {computed} from 'vue';
import ChatIcon from './ChatIcon.vue';
import {safeLink} from '../../composables/chat-model.js';
const props=defineProps({url:String,meta:Object});
const target=computed(()=>safeLink(props.url));
const domain=computed(()=>{try{return new URL(target.value).hostname.replace(/^www\./,'');}catch{return '';}});
const thumbnail=computed(()=>safeLink(props.meta?.image));
</script>
<template><a v-if="target" :href="target" target="_blank" rel="noopener noreferrer" class="link-preview"><div v-if="thumbnail" class="thumbnail"><img :src="thumbnail" alt="" referrerpolicy="no-referrer" loading="lazy"><span v-if="meta?.video" class="play" aria-hidden="true">▶</span><span v-if="meta?.duration" class="duration">{{ meta.duration }}</span></div><div class="details"><strong>{{ meta?.title||domain }}</strong><span v-if="meta?.description" class="description">{{ meta.description }}</span><span class="domain"><ChatIcon name="link"/>{{ domain }}<img v-if="safeLink(meta?.logo)" :src="safeLink(meta.logo)" alt="" referrerpolicy="no-referrer"></span></div></a></template>
<style scoped>
.link-preview{display:block;color:inherit;text-decoration:none;background:#0002;border-radius:9px;overflow:hidden;margin:-3px -3px 6px}.thumbnail{position:relative;aspect-ratio:1.8;background:#111b21}.thumbnail>img{width:100%;height:100%;object-fit:cover}.play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:50px;height:50px;border-radius:50%;background:#0009;color:white;font-size:22px}.duration{position:absolute;right:8px;bottom:8px;background:#000b;border-radius:4px;padding:2px 5px;font-size:11px}.details{padding:10px;display:grid;gap:6px}.details strong{font-size:14px;line-height:1.4}.description{font-size:12px;color:#c2cbc9;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.domain{display:flex;align-items:center;gap:6px;font-size:11px;color:#b5c7c4}.domain svg{width:13px;height:13px}.domain img{width:16px;height:16px;margin-left:auto;object-fit:contain}
</style>

<script setup>
import { computed } from "vue";
import { photoUrl } from "../api.js";
const props = defineProps({ person: Object, size: { type: Number, default: 48 } });
const src = computed(() => photoUrl(props.person?.photos?.[0] || props.person?.photo));
const initials = computed(() => (props.person?.name || "?").slice(0, 1).toUpperCase());
</script>
<template>
  <img v-if="src" :src="src" :alt="''" class="av" :style="{ width: size + 'px', height: size + 'px' }" loading="lazy">
  <span v-else class="av fallback" :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.42 + 'px' }" aria-hidden="true">{{ initials }}</span>
</template>
<style scoped>
.av{border-radius:50%;object-fit:cover;flex:none;display:inline-block}
.fallback{display:inline-grid;place-items:center;background:var(--green);color:var(--on);font-family:var(--display);font-weight:800}
</style>

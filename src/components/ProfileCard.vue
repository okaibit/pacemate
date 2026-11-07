<script setup>
import { ref, computed, watch } from "vue";
import { photoUrl } from "../api.js";
import { session } from "../auth.js";
import TripBadge from "./TripBadge.vue";
const props = defineProps({ person: { type: Object, required: true } });
const i = ref(0);
watch(() => props.person.id, () => (i.value = 0));
const mine = computed(() => session.profile?.sports || []);
const photo = computed(() => props.person.photos?.[i.value]);
</script>
<template>
  <article class="pc">
    <div class="ph">
      <img v-if="photo" :src="photoUrl(photo)" :alt="'Photo of ' + person.name">
      <div v-else class="none" aria-hidden="true">{{ person.name.slice(0, 1) }}</div>
      <div v-if="person.photos?.length > 1" class="dots">
        <button v-for="(p, n) in person.photos" :key="p" :class="{ on: n === i }" @click="i = n" :aria-label="'Show photo ' + (n + 1)"></button>
      </div>
      <button v-if="i > 0" class="nav l" @click="i--" aria-label="Previous photo">‹</button>
      <button v-if="i < (person.photos?.length || 0) - 1" class="nav r" @click="i++" aria-label="Next photo">›</button>
    </div>
    <div class="info">
      <h2>{{ person.name }}, {{ person.age }} <span v-if="person.verified" class="verified" aria-label="Photo verified" title="Profile photos reviewed against a private selfie">✓</span></h2>
      <p class="mute where">
        {{ person.currentCity }}<template v-if="person.homeCity && person.homeCity !== person.currentCity"> · from {{ person.homeCity }}</template>
      </p>
      <TripBadge :person="person" style="margin-top:8px" />
      <div class="chips" style="margin:10px 0">
        <span v-for="s in person.sports" :key="s" class="tag" :class="{ hot: mine.includes(s) }">{{ s }}</span>
      </div>
      <dl class="facts">
        <div v-if="person.goal"><dt>Looking for</dt><dd>{{ person.goal }}</dd></div>
        <div v-if="person.level"><dt>Level</dt><dd>{{ person.level }}</dd></div>
        <div v-if="person.routine"><dt>Trains</dt><dd>{{ person.routine }}</dd></div>
        <div v-if="person.workStyle"><dt>Works</dt><dd>{{ person.workStyle }}</dd></div>
      </dl>
      <p v-if="person.bio" class="bio">{{ person.bio }}</p>
      <div v-if="person.prompt" class="prompt"><small>{{ person.prompt.question }}</small><p>{{ person.prompt.answer }}</p></div>
      <slot />
    </div>
  </article>
</template>
<style scoped>
.pc{background:var(--card);border:1px solid var(--line);border-radius:22px;overflow:hidden}
.ph{position:relative;aspect-ratio:4/5;background:var(--soft)}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.none{display:grid;place-items:center;height:100%;font:800 96px var(--display);color:var(--green)}
.dots{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:4px}
.dots button{flex:1;height:4px;border:0;border-radius:4px;background:rgba(255,255,255,.5);padding:0;cursor:pointer}
.dots button.on{background:#fff}
.nav{position:absolute;top:0;bottom:0;width:30%;background:none;border:0;color:#fff;font-size:34px;cursor:pointer;opacity:0}
.nav:focus-visible,.nav:hover{opacity:.9}
.nav.l{left:0;text-align:left;padding-left:10px}.nav.r{right:0;text-align:right;padding-right:10px}
.info{padding:16px 18px 18px}
h2{font-size:28px}
.where{margin:2px 0 0}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin:8px 0}
.facts dt{font-size:12px;color:var(--mute);text-transform:uppercase;letter-spacing:.06em}
.facts dd{margin:0;font-weight:700}
.bio{margin:10px 0 0;white-space:pre-line}
.prompt{margin-top:12px;background:var(--soft);border-radius:14px;padding:10px 14px}.prompt small{color:var(--mute);font-weight:700}.prompt p{margin:2px 0 0;font-weight:500}
.verified{display:inline-grid;place-items:center;background:var(--green);color:var(--on);border-radius:50%;width:23px;height:23px;font-size:15px;vertical-align:middle}
</style>

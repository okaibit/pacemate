<script setup>
import { ref, computed, watch } from "vue";
import { photoUrl } from "../api.js";
import { session } from "../auth.js";
import { MODES } from "../foundation/compatibility.js";
import TripBadge from "./TripBadge.vue";
const props = defineProps({ person: { type: Object, required: true }, immersive: Boolean, portrait: Boolean });
const i = ref(0), failed=ref(false), showDetails=ref(false);
watch(() => props.person.id, () => { i.value=0;failed.value=false;showDetails.value=false; });
watch(() => props.person.photos?.[i.value],()=>failed.value=false);
const mine = computed(() => session.profile?.sports || []);
const photo = computed(() => props.person.photos?.[i.value]);
const initials = computed(() => (props.person.name || '').trim().split(/\s+/).slice(0,2).map(word=>word[0]||'').join('').toUpperCase());
const modes = computed(() => (props.person.connection_modes || []).filter(mode=>Object.hasOwn(MODES,mode)));
const sharedModes = computed(() => (props.person.sharedConnectionModes || []).filter(mode=>modes.value.includes(mode)));
const compatibility = computed(() => {
 const value=props.person.compatibility;
 return value?.eligible && Number.isFinite(value.score) && value.score>=0 && value.score<=100 ? value : null;
});
const reasons = computed(() => (compatibility.value?.reasons || []).filter(reason=>typeof reason==='string'&&!reason.startsWith('Both open to ')).slice(0,3));
const hasDetails = computed(() => !!(props.person.bio || props.person.prompt || props.person.level || props.person.routine || props.person.workStyle || props.person.nextCity || props.person.arrival));
</script>
<template>
  <article class="pc" :class="{immersive,portrait}">
    <div class="ph" :class="{'without-photo':!photo||failed}">
      <img v-if="photo && !failed" :src="photoUrl(photo)" :alt="'Photo of ' + person.name" @error="failed=true">
      <div v-else class="none"><span class="initials" aria-hidden="true">{{ initials }}</span><span class="photo-status">{{ failed?'Photo unavailable':'No photo added' }}</span></div>
      <div v-if="person.photos?.length > 1" class="photo-pages" aria-label="Profile photos">
        <button v-for="(p, n) in person.photos" :key="p" :class="{ on: n === i }" @click="i = n" :aria-pressed="n===i" :aria-label="'Show photo ' + (n + 1)"><span/></button>
      </div>
      <button v-if="i > 0" class="nav l" @click="i--" aria-label="Previous photo">‹</button>
      <button v-if="i < (person.photos?.length || 0) - 1" class="nav r" @click="i++" aria-label="Next photo">›</button>
    </div>
    <div v-if="immersive" class="identity-panel">
      <header class="identity">
        <h2>{{ person.name }}<template v-if="person.age">, {{ person.age }}</template></h2>
        <span v-if="person.verified" class="verified">Photo verified</span>
        <p>{{ person.currentCity || person.city }}<template v-if="person.distanceKm != null"> · {{ person.distanceKm }} km away</template></p>
      </header>
      <div v-if="modes.length" class="connection-modes" :aria-label="sharedModes.length?'Connection modes, shared modes highlighted':'Open to'">
        <span v-for="mode in modes" :key="mode" :class="{shared:sharedModes.includes(mode)}">{{ MODES[mode] }}</span>
      </div>
      <p v-else-if="person.goal" class="legacy-intent">{{ person.goal }}</p>
      <div v-if="person.sports?.length" class="hero-sports" aria-label="Sports, shared sports highlighted"><span v-for="sport in person.sports.slice(0,4)" :key="sport" :class="{shared:mine.includes(sport)}" :title="mine.includes(sport)?'You both enjoy '+sport:sport">{{ sport }}</span></div>
      <section v-if="compatibility" class="compatibility" aria-label="Your compatibility">
        <p><strong>{{ compatibility.score }}<span>/100</span></strong><span>Compatibility</span></p>
        <ul v-if="reasons.length"><li v-for="reason in reasons" :key="reason">{{ reason }}</li></ul>
      </section>
      <p v-else-if="person.bio" class="bio-preview">{{ person.bio }}</p>
      <div class="profile-actions"><slot name="actions" /></div>
      <button v-if="portrait&&hasDetails" class="details-toggle" :aria-expanded="showDetails" :aria-controls="'profile-details-'+person.id" @click="showDetails=!showDetails">{{ showDetails?'Less about':'More about' }} {{ person.name }}<span aria-hidden="true">{{ showDetails?'−':'+' }}</span></button>
    </div>
    <div v-if="!portrait||showDetails" :id="'profile-details-'+person.id" class="info">
      <h2 v-if="!immersive">{{ person.name }}, {{ person.age }} <span v-if="person.verified" class="verified">Photo verified</span></h2>
      <p v-if="!immersive" class="mute where">{{ person.currentCity || person.city }}<template v-if="person.homeCity && person.homeCity !== person.currentCity"> · from {{ person.homeCity }}</template></p>
      <TripBadge :person="person" />
      <div v-if="!immersive" class="chips"><span v-for="s in person.sports" :key="s" class="tag" :class="{ hot: mine.includes(s) }">{{ s }}</span></div>
      <dl class="facts">
        <div v-if="person.goal&&!modes.length"><dt>Looking for</dt><dd>{{ person.goal }}</dd></div>
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
.pc{background:var(--bg);border:1px solid var(--line);overflow:hidden;border-radius:24px;min-width:0}
.ph{position:relative;aspect-ratio:4/5;background:var(--soft);min-width:0;overflow:hidden}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.none{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;color:var(--ink)}
.initials{border-radius:18px;display:grid;place-items:center;width:76px;height:76px;border:1px solid var(--line);font:600 30px var(--display);letter-spacing:.02em}
.photo-status{font-size:12px;color:var(--mute)}
.photo-pages{position:absolute;top:0;left:12px;right:12px;display:flex;gap:5px;z-index:2}
.photo-pages button{flex:1;min-width:0;min-height:44px;padding:0;border:0;background:none;cursor:pointer;display:flex;align-items:center}
.photo-pages span{width:100%;height:3px;background:#193a2b;border:1px solid #e8eee2}
.photo-pages .on span{background:#e8eee2}
.nav{position:absolute;top:44px;bottom:0;width:22%;min-width:44px;border:0;background:none;color:#f3f1e8;font:400 36px var(--body);cursor:pointer}
.nav.l{left:0;text-align:left;padding-left:12px}.nav.r{right:0;text-align:right;padding-right:12px}
.without-photo .nav{color:var(--ink)}
.identity-panel{padding:24px;display:flex;flex-direction:column;gap:16px;min-width:0;overflow-wrap:anywhere}
.identity h2{font:600 clamp(26px,2.3vw,34px)/1.12 var(--display);letter-spacing:-.035em;margin:0}
.identity p{font-size:13px;color:var(--mute);margin:9px 0 0}
.verified{display:inline-block;font:600 10px var(--body);color:var(--green);margin-top:8px}
.connection-modes,.hero-sports{display:flex;flex-wrap:wrap;gap:6px}
.connection-modes span{font-size:12px;line-height:1.5;color:var(--mute)}
.connection-modes span+span:before{content:'/';display:inline-block;margin-right:6px;color:var(--mute)}
.connection-modes .shared{color:var(--ink);font-weight:600}
.hero-sports span{border-radius:999px;border:1px solid var(--line);padding:5px 8px;font-size:11px;line-height:1.4;color:var(--mute)}
.hero-sports .shared{background:var(--soft);color:var(--ink)}
.legacy-intent{font-size:13px;color:var(--mute);margin:0}
.compatibility{padding-top:15px;border-top:1px solid var(--line)}
.compatibility>p{display:flex;align-items:baseline;gap:12px;margin:0 0 10px;font-size:12px;color:var(--mute)}
.compatibility strong{font:600 29px/1 var(--display);color:var(--ink)}
.compatibility strong span{font:400 12px var(--body);color:var(--mute);margin-left:3px}
.compatibility ul{list-style:none;padding:0;margin:0;display:grid;gap:5px}
.compatibility li{font-size:12px;line-height:1.5;color:var(--mute)}
.bio-preview{font:400 16px/1.6 var(--body);margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.profile-actions{display:flex;gap:10px;margin-top:auto;padding-top:6px}
.details-toggle{display:flex;justify-content:space-between;align-items:center;gap:14px;width:100%;min-height:44px;border:0;border-top:1px solid var(--line);padding:13px 0 0;background:none;color:var(--mute);font:500 12px var(--body);text-align:left;cursor:pointer}
.details-toggle span{font-size:20px}
.info{padding:24px;overflow-wrap:anywhere}
.pc .tag{border-radius:999px}.info h2{font-size:28px}.where{margin:6px 0 12px}.chips{margin:12px 0}
.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:12px 0}
.facts dt{font-size:11px;color:var(--mute);margin-bottom:4px}.facts dd{margin:0;font-size:13px;font-weight:600}
.bio{margin:16px 0 0;white-space:pre-line;line-height:1.7;font-size:14px}
.prompt{margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}.prompt small{color:var(--mute);font-size:12px}.prompt p{margin:6px 0 0;font-size:15px}
.immersive{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.immersive .ph{aspect-ratio:auto;min-height:360px}
.immersive .info{grid-column:1/-1;border-top:1px solid var(--line)}
@media(min-width:701px){.portrait.immersive{min-height:clamp(360px,calc(100svh - 330px),480px)}.portrait.immersive .ph img{position:absolute;inset:0}.portrait .identity-panel{gap:14px}.portrait .without-photo{min-height:300px}}
@media(max-width:700px){.immersive{display:block}.immersive .ph{height:clamp(240px,38svh,350px);min-height:0;aspect-ratio:auto}.identity-panel{padding:20px;gap:14px}.identity h2{font-size:29px}.info{padding:20px}.profile-actions{margin-top:2px}.none{gap:14px}.initials{width:64px;height:64px;font-size:26px}.portrait .without-photo{height:180px}}
</style>

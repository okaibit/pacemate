<script setup>
import { ref, computed, watch } from "vue";
import { photoUrl } from "../api.js";
import { session } from "../auth.js";
import TripBadge from "./TripBadge.vue";
const props = defineProps({ person: { type: Object, required: true }, immersive: Boolean, portrait: Boolean });
const i = ref(0), failed=ref(false),showDetails=ref(false);
watch(() => props.person.id, () => { i.value=0;showDetails.value=false; });
watch(() => props.person.photos?.[i.value],()=>failed.value=false);
const mine = computed(() => session.profile?.sports || []);
const photo = computed(() => props.person.photos?.[i.value]);
</script>
<template>
  <article class="pc" :class="{immersive,portrait}">
    <div class="ph">
      <img v-if="photo && !failed" :src="photoUrl(photo)" :alt="'Photo of ' + person.name" @error="failed=true">
      <div v-else class="none" aria-hidden="true">{{ person.name.slice(0, 1) }}</div>
      <div v-if="person.photos?.length > 1" class="dots">
        <button v-for="(p, n) in person.photos" :key="p" :class="{ on: n === i }" @click="i = n" :aria-label="'Show photo ' + (n + 1)"></button>
      </div>
      <button v-if="i > 0" class="nav l" @click="i--" aria-label="Previous photo">‹</button>
      <button v-if="i < (person.photos?.length || 0) - 1" class="nav r" @click="i++" aria-label="Next photo">›</button>
      <div v-if="immersive" class="photo-identity">
        <p v-if="portrait&&person.goal" class="profile-intent">{{ person.goal }}</p>
        <h2>{{ person.name }}<template v-if="person.age">, {{ person.age }}</template> <span v-if="person.verified" class="verified" aria-label="Photo verified">Verified</span></h2>
        <p>{{ person.currentCity }}<template v-if="person.distanceKm != null"> · {{ person.distanceKm }} km away</template></p>
        <div class="hero-sports"><span v-for="sport in person.sports?.slice(0,4)" :key="sport" :class="{shared:mine.includes(sport)}" :title="mine.includes(sport)?'You both enjoy '+sport:sport">{{ mine.includes(sport)?' ':'' }}{{ sport }}</span></div>
      </div>
      <div v-if="immersive" class="photo-actions"><slot name="actions" /></div>
    </div>
    <button v-if="portrait" class="details-toggle" :aria-expanded="showDetails" @click="showDetails=!showDetails">{{ showDetails?'Less about':'About' }} {{ person.name }}<span aria-hidden="true">{{ showDetails?'−':'+' }}</span></button>
    <div v-if="!portrait||showDetails" class="info">
      <h2 v-if="!immersive">{{ person.name }}, {{ person.age }} <span v-if="person.verified" class="verified" aria-label="Photo verified" title="Profile photos reviewed against a private selfie">✓</span></h2>
      <p v-if="!immersive" class="mute where">
        {{ person.currentCity }}<template v-if="person.homeCity && person.homeCity !== person.currentCity"> · from {{ person.homeCity }}</template>
      </p>
      <TripBadge :person="person" style="margin-top:8px" />
      <div v-if="!immersive" class="chips" style="margin:10px 0">
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
.pc{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ph{position:relative;aspect-ratio:4/5;background:var(--soft)}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.none{display:grid;place-items:center;height:100%;font:800 96px var(--display);color:var(--green)}
.dots{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:4px}
.dots button{flex:1;height:4px;border:0;border-radius:12px;background:var(--card);padding:0;cursor:pointer}
.dots button.on{background:var(--card)}
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
.prompt{margin-top:12px;background:var(--soft);border-radius:12px;padding:10px 14px}.prompt small{color:var(--mute);font-weight:700}.prompt p{margin:2px 0 0;font-weight:500}
.verified{display:inline-grid;place-items:center;background:var(--green);color:var(--on);border-radius:12px;width:23px;height:23px;font-size:15px;vertical-align:middle}
</style>

<style scoped>
.immersive{border:0;border-radius:12px;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.85fr);isolation:isolate}.immersive .ph{aspect-ratio:auto;height:clamp(490px,71vh,690px);min-width:0;overflow:hidden;background:#244f3b}.immersive .none{color:#e9eee1}.immersive .ph:after{content:'';position:absolute;inset:20% 0 0;background:rgba(16,44,35,.48);pointer-events:none}.immersive .nav{z-index:1;bottom:225px;width:23%}.immersive .dots{z-index:3;top:16px;left:16px;right:16px}.immersive .dots button{height:5px;min-height:12px;background-clip:content-box;padding:3px 0}
.photo-identity{position:absolute;bottom:116px;left:28px;right:22px;color:#fff;z-index:2;pointer-events:none}.photo-identity h2{font-size:clamp(30px,3vw,42px);letter-spacing:-.035em;}.photo-identity p{margin:8px 0 16px;font-size:14px;color:#f3f5ef}.hero-sports{display:flex;gap:7px;flex-wrap:wrap}.hero-sports span{padding:6px 11px;background:#ffffff20;border:1px solid #ffffff35;border-radius:12px;font-size:12px;font-weight:600;}.hero-sports .shared{background:#e9efda;color:#244b37;border-color:transparent}.photo-actions{position:absolute;bottom:24px;left:0;right:0;z-index:3;display:flex;justify-content:center;align-items:center;gap:24px}.immersive .info{padding:34px 28px;display:flex;flex-direction:column;gap:22px;overflow-wrap:anywhere}.immersive .bio{order:-2;font-family:var(--display);font-size:25px;line-height:1.4;letter-spacing:-.025em;margin:0}.immersive .facts{gap:20px 12px;margin:0}.immersive .facts dt{font-size:10px;letter-spacing:.09em;margin-bottom:5px}.immersive .facts dd{font-size:14px;font-weight:500}.immersive .prompt{margin-top:auto;padding:22px 20px;border-radius:12px}.immersive .prompt small{font-size:11px;line-height:1.5;display:block}.immersive .prompt p{font:600 22px/1.35 var(--display);margin-top:10px}.immersive .verified{width:22px;height:22px;font-size:13px;background:#e9efda;color:#244b37}
@media(max-width:700px){.immersive{display:block;border-radius:12px}.immersive .ph{height:clamp(450px,72svh,680px)}.immersive .info{padding:24px;gap:20px}.photo-identity{left:24px;bottom:112px}.immersive .bio{font-size:23px}.immersive .prompt{margin-top:0}}
</style>


<style scoped>
.immersive{border:0;border-radius:28px;box-shadow:0 16px 56px #173a2812;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.85fr);isolation:isolate}.immersive .ph{aspect-ratio:auto;height:clamp(490px,71vh,690px);min-width:0;overflow:hidden;background:linear-gradient(140deg,#3b6d50,#152f25)}.immersive .none{color:#e9eee1}.immersive .ph:after{content:'';position:absolute;inset:20% 0 0;background:linear-gradient(transparent,#10251a15 20%,#10251ac9 80%,#10251ae6);pointer-events:none}.immersive .nav{z-index:1;bottom:225px;width:23%}.immersive .dots{z-index:3;top:16px;left:16px;right:16px}.immersive .dots button{height:5px;min-height:12px;background-clip:content-box;padding:3px 0}
.photo-identity{position:absolute;bottom:116px;left:28px;right:22px;color:#fff;z-index:2;pointer-events:none}.photo-identity h2{font-size:clamp(30px,3vw,42px);letter-spacing:-.035em;text-shadow:0 1px 12px #0002}.photo-identity p{margin:8px 0 16px;font-size:14px;color:#f3f5ef}.hero-sports{display:flex;gap:7px;flex-wrap:wrap}.hero-sports span{padding:6px 11px;background:#ffffff20;border:1px solid #ffffff35;border-radius:999px;font-size:12px;font-weight:600;backdrop-filter:blur(12px)}.hero-sports .shared{background:#e9efda;color:#244b37;border-color:transparent}.photo-actions{position:absolute;bottom:24px;left:0;right:0;z-index:3;display:flex;justify-content:center;align-items:center;gap:24px}.immersive .info{padding:34px 28px;display:flex;flex-direction:column;gap:22px;overflow-wrap:anywhere}.immersive .bio{order:-2;font-family:var(--display);font-size:25px;line-height:1.4;letter-spacing:-.025em;margin:0}.immersive .facts{gap:20px 12px;margin:0}.immersive .facts dt{font-size:10px;letter-spacing:.09em;margin-bottom:5px}.immersive .facts dd{font-size:14px;font-weight:500}.immersive .prompt{margin-top:auto;padding:22px 20px;border-radius:18px}.immersive .prompt small{font-size:11px;line-height:1.5;display:block}.immersive .prompt p{font:600 22px/1.35 var(--display);margin-top:10px}.immersive .verified{width:22px;height:22px;font-size:13px;background:#e9efda;color:#244b37}
@media(max-width:700px){.immersive{display:block;border-radius:24px}.immersive .ph{height:clamp(450px,72svh,680px)}.immersive .info{padding:24px;gap:20px}.photo-identity{left:24px;bottom:112px}.immersive .bio{font-size:23px}.immersive .prompt{margin-top:0}}
</style>
<style scoped>.pc{border-radius:22px}.verified{border-radius:50%}.immersive{border-radius:28px}.hero-sports span,.hero-sports .shared{border-radius:999px}.facts{border-radius:14px}</style>
<style scoped>
.portrait.immersive{display:block;width:100%;max-width:440px;margin:0 auto;border:1px solid var(--line);border-radius:6px;box-shadow:none}.portrait.immersive .ph{height:clamp(460px,67svh,650px);aspect-ratio:auto}.portrait .photo-identity{left:24px;right:24px;bottom:106px}.portrait .photo-identity h2{font-size:34px;line-height:1.1}.portrait .photo-identity>p:not(.profile-intent){font-size:12px;margin:8px 0 13px}.portrait .profile-intent{display:inline-block;margin:0 0 13px;padding:5px 9px;background:#f1efe3;color:#244f3b;font-size:11px;font-weight:600;line-height:1.4}.portrait .hero-sports span{border-radius:3px;font-size:10px;padding:5px 8px;background:#244f3b;color:#f2efe7;border-color:#a5b19b}.portrait .hero-sports .shared{background:#e2e8d5;color:#244f3b;border-color:#e2e8d5}.portrait .photo-actions{bottom:23px;gap:14px}.details-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;border:0;border-top:1px solid var(--line);background:var(--card);color:var(--ink);padding:17px 22px;text-align:left;font-size:12px;font-weight:600;cursor:pointer}.details-toggle span{font-size:19px;font-weight:400}.portrait.immersive .info{padding:24px;gap:20px}.portrait.immersive .bio{font:400 15px/1.75 var(--body);letter-spacing:0}.portrait .verified{font:600 9px var(--body);width:auto!important;height:auto!important;border-radius:3px;padding:4px 6px;vertical-align:middle}.portrait .prompt{border-radius:4px}.portrait .nav{opacity:.8}.portrait .nav:hover{opacity:1}
@media(max-width:700px){.portrait.immersive{max-width:460px}.portrait.immersive .ph{height:clamp(440px,66svh,620px)}.portrait .photo-identity{left:22px;right:20px}.portrait .photo-identity h2{font-size:32px}}
</style>

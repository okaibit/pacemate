<script setup>
import {ref,computed,watch} from 'vue';
import {photoUrl} from '../api.js';
import {session} from '../auth.js';
import {MODES,COMPATIBILITY_WEIGHTS} from '../foundation/compatibility.js';
import Modal from './Modal.vue';
import TripBadge from './TripBadge.vue';
const props=defineProps({person:{type:Object,required:true}});
const emit=defineEmits(['report']);
const photoIndex=ref(0),failed=ref(false),details=ref(false);
watch(()=>props.person.id,()=>{photoIndex.value=0;failed.value=false;details.value=false;});
watch(()=>props.person.photos?.[photoIndex.value],()=>failed.value=false);
const photo=computed(()=>props.person.photos?.[photoIndex.value]);
const initials=computed(()=>(props.person.name||'').split(/\s+/).slice(0,2).map(word=>word[0]||'').join(''));
const modes=computed(()=>(props.person.connection_modes||[]).filter(mode=>Object.hasOwn(MODES,mode)));
const sharedModes=computed(()=>props.person.sharedConnectionModes||[]);
const sharedSport=sport=>(session.profile?.sports||[]).some(mine=>mine.toLowerCase()===sport.toLowerCase());
const sports=computed(()=>{const list=props.person.sports||[];return [...list.filter(sharedSport),...list.filter(sport=>!sharedSport(sport))];});
const compatibility=computed(()=>{const value=props.person.compatibility;return value?.eligible&&Number.isFinite(value.score)&&value.score>=0&&value.score<=100?value:null;});
const labels={sports:'Sports',availability:'Availability',intensity:'Intensity',location:'Location',experience:'Experience',lifestyle:'Lifestyle',intentions:'Connection modes'};
function report(){details.value=false;emit('report');}
</script>
<template>
 <article class="discover-profile" aria-label="Discover profile">
  <div class="photo" :class="{'without-photo':!photo||failed}">
   <img v-if="photo&&!failed" :src="photoUrl(photo)" :alt="'Photo of '+person.name" @error="failed=true">
   <div v-else class="photo-fallback"><span>{{ initials }}</span><small>{{ failed?'Photo unavailable':'No photo added' }}</small></div>
   <div v-if="person.photos?.length>1" class="photo-pages" aria-label="Profile photos">
    <button v-for="(p,n) in person.photos" :key="p" :class="{on:n===photoIndex}" @click="photoIndex=n" :aria-pressed="n===photoIndex" :aria-label="'Show photo '+(n+1)"><span/></button>
   </div>
   <button v-if="photoIndex>0" class="nav l" @click="photoIndex--" aria-label="Previous photo">‹</button>
   <button v-if="photoIndex<(person.photos?.length||0)-1" class="nav r" @click="photoIndex++" aria-label="Next photo">›</button>
  </div>
  <div class="photo-overlay" @click="details=true">
   <div class="identity-row">
    <button class="identity" aria-haspopup="dialog" :aria-label="'About '+person.name" @click.stop="details=true"><span class="name">{{ person.name }}<template v-if="person.age">, {{ person.age }}</template></span><span class="city">{{ person.currentCity||person.city }}</span></button>
    <button class="score" aria-haspopup="dialog" aria-label="Open compatibility and profile details" @click.stop="details=true"><span v-if="compatibility">{{ compatibility.score }}<small>/100</small></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>
   </div>
   <div v-if="modes.length" class="mode-row" aria-label="Connection modes, shared modes highlighted"><span v-for="mode in modes" :key="mode" :class="{shared:sharedModes.includes(mode)}">{{ MODES[mode] }}</span></div>
   <div v-if="sports.length" class="sport-row" aria-label="Sports, shared sports highlighted"><span v-for="sport in sports.slice(0,4)" :key="sport" :class="{shared:sharedSport(sport)}">{{ sport }}</span><span v-if="sports.length>4" class="more-sports" :aria-label="(sports.length-4)+' more sports'">+{{ sports.length-4 }}</span></div>
  </div>
 </article>
 <Modal v-if="details" label="Why we matched" sheet @close="details=false">
  <header class="detail-heading"><h2>Why we matched</h2><button class="close-details" aria-label="Close profile details" @click="details=false">×</button></header>
  <h3 class="detail-name">{{ person.name }}<template v-if="person.age">, {{ person.age }}</template></h3><p class="detail-city">{{ person.currentCity||person.city }}</p>
  <section v-if="compatibility" class="score-breakdown" aria-label="Compatibility breakdown"><strong class="total-score">{{ compatibility.score }}<small>/100</small></strong><dl><div v-for="(weight,key) in COMPATIBILITY_WEIGHTS" :key="key"><dt>{{ labels[key] }}</dt><dd>{{ compatibility.breakdown?.[key]??0 }}<span>/{{ weight }}</span></dd></div></dl><ul v-if="compatibility.reasons?.length"><li v-for="reason in compatibility.reasons" :key="reason">{{ reason }}</li></ul></section>
  <section v-if="person.preferred_days?.length||person.preferred_times?.length||person.routine" class="detail-section"><h3>Availability</h3><p v-if="person.preferred_days?.length">{{ person.preferred_days.join(', ') }}</p><p v-if="person.preferred_times?.length">{{ person.preferred_times.join(' / ') }}</p><p v-if="person.routine">{{ person.routine }}</p></section>
  <section v-if="person.bio" class="detail-section"><h3>About</h3><p class="bio">{{ person.bio }}</p></section>
  <dl class="profile-facts"><div v-if="person.level"><dt>Level</dt><dd>{{ person.level }}</dd></div><div v-if="person.workStyle"><dt>Works</dt><dd>{{ person.workStyle }}</dd></div><div v-if="person.verified"><dt>Photo verification</dt><dd>Verified</dd></div></dl>
  <TripBadge :person="person"/>
  <section v-if="person.prompt" class="detail-section"><h3>{{ person.prompt.question }}</h3><p>{{ person.prompt.answer }}</p></section>
  <button class="report-action" @click="report">Block or report</button>
 </Modal>
</template>
<style scoped>
.discover-profile{position:relative;min-height:0;height:100%;width:100%;overflow:hidden;border-radius:16px;background:#14261E;color:#fff;isolation:isolate}
.photo{position:absolute;inset:0}.photo img{width:100%;height:100%;object-fit:cover;display:block}.photo-fallback{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#9AB0A6}.photo-fallback>span{font:500 64px var(--editorial);color:#fff}.photo-fallback small{font-size:12px}
.photo-pages{position:absolute;top:0;left:12px;right:12px;display:flex;gap:5px;z-index:4}.photo-pages button{flex:1;min-width:0;min-height:44px;padding:0;border:0;background:none;cursor:pointer;display:flex;align-items:center}.photo-pages span{width:100%;height:3px;background:#193a2b;border:1px solid #e8eee2}.photo-pages .on span{background:#e8eee2}
.nav{position:absolute;top:44px;bottom:160px;width:22%;min-width:44px;border:0;background:none;color:#f3f1e8;font:400 36px var(--body);cursor:pointer;z-index:1}.nav.l{left:0;text-align:left;padding-left:12px}.nav.r{right:0;text-align:right;padding-right:12px}
.photo-overlay{position:absolute;inset:auto 0 0;padding:18px 16px 16px;z-index:2;display:flex;flex-direction:column;gap:10px;cursor:pointer}.photo-overlay:before{content:'';position:absolute;z-index:-1;inset:-110px 0 0;background:linear-gradient(to top,#0D1B15 0%,rgba(13,27,21,.8) 52%,transparent 100%);pointer-events:none}
.identity-row{display:flex;align-items:center;gap:12px}.identity{flex:1;min-width:0;background:none;border:0;color:#fff;padding:0;text-align:left;cursor:pointer;display:flex;align-items:baseline;column-gap:8px;flex-wrap:wrap}.name{font:500 clamp(24px,4vw,32px)/1.12 var(--editorial);overflow-wrap:anywhere}.city{font-size:12px;color:#e3ebe6}.city:before{content:'·';margin-right:8px}
.score{display:flex;align-items:center;gap:8px;flex:none;min-height:44px;padding:7px 10px;border:1px solid #ffffff38;border-radius:999px;background:#14261E;color:#fff;font-weight:700;cursor:pointer}.score small{font-size:10px;font-weight:400;color:#c6d6ce;margin-left:1px}
.mode-row{display:flex;gap:5px;flex-wrap:nowrap;font-size:11px;line-height:1.4;color:#b1c0b8}.mode-row span+span:before{content:'/';margin-right:5px;color:#9AB0A6}.mode-row .shared{color:#c3f0d9;font-weight:700}.sport-row{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;max-width:100%;padding-bottom:1px}.sport-row::-webkit-scrollbar{display:none}.sport-row span{flex:none;border:1px solid #ffffff30;border-radius:999px;padding:5px 9px;font-size:11px;line-height:1.2;color:#d2ddd6;background:#14261E99}.sport-row .shared{background:#38D389;color:#0D1B15;border-color:#38D389;font-weight:700}.sport-row .more-sports{color:#9AB0A6;background:#14261E;border-color:#ffffff24;font-weight:700}
.detail-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.detail-heading h2{font:500 27px var(--editorial)}.close-details{width:44px;height:44px;border:0;background:none;color:var(--ink);font-size:28px;cursor:pointer}.detail-name{font:500 24px var(--editorial);margin-top:18px}.detail-city{margin:5px 0 18px;color:var(--mute);font-size:13px}.total-score{font:500 36px var(--editorial)}.total-score small{font:400 13px var(--body);color:var(--mute)}.score-breakdown dl{margin:16px 0}.score-breakdown dl>div,.profile-facts>div{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}.score-breakdown dd,.profile-facts dd{margin:0}.score-breakdown dd span{color:var(--mute);font-size:11px;margin-left:2px}.score-breakdown ul{padding-left:18px;font-size:13px;line-height:1.65;color:var(--mute)}.detail-section{margin-top:22px}.detail-section h3{font:500 20px var(--editorial);margin-bottom:8px}.detail-section p{margin:5px 0;font-size:14px;line-height:1.7}.bio{white-space:pre-line}.profile-facts dt{color:var(--mute)}.report-action{display:block;border:0;background:none;color:var(--mute);padding:14px 0;min-height:44px;font-size:12px;cursor:pointer;margin-top:20px}
@media(max-width:360px){.photo-overlay{padding:12px;gap:8px}.name{font-size:23px}.mode-row{font-size:10px}.score{gap:4px;padding:6px 8px}.sport-row span{font-size:10px}}
</style>

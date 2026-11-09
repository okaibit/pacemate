<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useRouter } from "vue-router";
import { api, formatEventTime } from "../api.js";
import { session } from "../auth.js";
import Modal from "../components/Modal.vue";
import ProfileCard from "../components/ProfileCard.vue";
import ReportDialog from "../components/ReportDialog.vue";
import {COUNTRIES} from "../money.js";
import { CITIES } from "../options.js";
import Avatar from "../components/Avatar.vue";
import {requestLocation} from "../location.js";

const router = useRouter();
const upcomingSession=ref(null);
let sessionRequest;
function loadUpcomingSession(){
 if(sessionRequest)return;
 const query=new URLSearchParams({city:session.profile.currentCity||''});
 sessionRequest=api('/api/events?'+query).then(result=>{
  upcomingSession.value=(result.events||[]).filter(e=>Date.parse(e.startsAt)>Date.now()).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))[0]||null;
 }).catch(()=>{});
}
const filtersOpen=ref(false);
const people = ref([]), loading = ref(true), err = ref(""), busy = ref(false);
const country=ref("");
const requestReference=ref("");
const scope = ref("anywhere"), sport = ref(""), arriving = ref(false);
const city = ref(""), radius = ref(""), draftCity = ref(""), draftRadius = ref(""), likes = ref(false), plus = ref(false);
let sequence = 0, active = true;
const locationBusy=ref(false),locationNotice=ref('');
async function suggestCity(){
 if(locationBusy.value)return;
 const owner=session.user?.id,previous=draftCity.value;
 locationBusy.value=true;locationNotice.value='';
 try{
  const position=await requestLocation();
  if(!active||session.user?.id!==owner||!filtersOpen.value)return;
  const {city:suggested}=await api('/api/location',{method:'POST',body:position,expectedUserId:owner});
  if(!active||session.user?.id!==owner||!filtersOpen.value||draftCity.value!==previous)return;
  if(suggested){draftCity.value=suggested;locationNotice.value=`Suggested city: ${suggested}. Select Search to use it.`;}
  else locationNotice.value='No nearby city was found. Enter a city instead.';
 }catch(error){if(active&&session.user?.id===owner)locationNotice.value=error.status?'City suggestions are unavailable. Enter a city instead.':error.message;}
 finally{if(active)locationBusy.value=false;}
}
function searchCity() { city.value=draftCity.value.trim();radius.value=draftRadius.value;load(); }
const match = ref(null), safety = ref(null), notice = ref("");

function selectScope(value){
 const previous=scope.value;
 scope.value=value;
 if(value==='anywhere'){
  const hadCity=!!(city.value||radius.value);
  city.value='';radius.value='';draftCity.value='';draftRadius.value='';
  if(hadCity&&previous===value)load();
 }
}
function resetFilters(){
 city.value='';radius.value='';draftCity.value='';draftRadius.value='';country.value='';sport.value='';arriving.value=false;likes.value=false;scope.value='anywhere';load();
}
async function load() {
  const token=++sequence,owner=session.user?.id;
  let deadline;
  loading.value = true; err.value = ""; requestReference.value="";people.value=[];
  try {
    const q = new URLSearchParams({ scope: scope.value, ...(country.value?{country:country.value}:{}), ...(city.value ? {city:city.value}:{}), ...(radius.value ? {radius:radius.value}:{}), ...(likes.value ? {likes:"1"}:{}), ...(sport.value ? { sport: sport.value } : {}), ...(arriving.value ? { arriving: "1" } : {}) });
    const result=await Promise.race([
      api(`/api/discover?${q}`,{expectedUserId:owner}),
      new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Discover is taking too long to respond. Please try again.')),30000);}),
    ]);
    if(active&&session.user?.id===owner&&token===sequence){
      if(!result||!Array.isArray(result.people))throw new Error('Discover returned an unexpected response. Please try again.');
      people.value=result.people;if(!result.people.length)loadUpcomingSession();
    }
  } catch (e) { if(active&&session.user?.id===owner&&token===sequence){
    err.value=e.message;requestReference.value=e.requestId||'';
    if(e.code||e.requestId)console.warn('Discover request failed',{code:e.code,requestId:e.requestId});
  } }
  finally { clearTimeout(deadline);if(active&&token===sequence)loading.value = false; }
}
watch([scope, sport, arriving, likes,country], load);
onMounted(()=>{load();loadUpcomingSession();api("/api/billing/config").then(b=>plus.value=b.active).catch(()=>{});});

async function swipe(liked) {
  const p = people.value[0];
  if (!p || busy.value) return;
  busy.value = true; err.value = ""; notice.value = "";
  try {
    const r = await api("/api/swipes", { method: "POST", body: { targetId: p.id, liked } });
    people.value=people.value.filter(person=>person.id!==p.id);
    if (r.match) match.value = r.match;
    if (people.value.length < 3) load();
  } catch (e) { err.value = e.message; }
  finally { busy.value = false; }
}
function onSafety(kind) {
  safety.value = null; people.value.shift();
  notice.value = kind === "report" ? "Thanks. We received your report and blocked this member." : "Blocked. You will not see each other again.";
}
function onKey(e) {
  if (filtersOpen.value || match.value || safety.value || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)) return;
  if (e.key === "ArrowLeft") swipe(false);
  if (e.key === "ArrowRight") swipe(true);
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => { active=false; window.removeEventListener("keydown", onKey); });
</script>

<template>
  <div class="discover-page">
    <header class="discover-top"><h1 class="discover-heading">Discover<span>.</span></h1><button class="filter-button" @click="filtersOpen=true" aria-label="Discovery filters" aria-haspopup="dialog"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--card)"/><circle cx="15" cy="17" r="3" fill="var(--card)"/></svg><span>Filters</span><i v-if="sport||arriving||city||radius||likes||country"/></button></header>
    <div class="discovery-scope"><button :aria-pressed="scope==='anywhere'" :class="{selected:scope==='anywhere'}" @click="selectScope('anywhere')">Anywhere</button><button :aria-pressed="scope==='city'" :class="{selected:scope==='city'}" @click="selectScope('city')">{{ session.profile.currentCity }}</button><button v-if="plus" :aria-pressed="likes" :class="{selected:likes}" @click="likes=!likes">Likes you</button></div>
    <Modal v-if="filtersOpen" label="Discovery filters" @close="filtersOpen=false"><h2 class="filter-title">Your kind of people</h2>
    <label class="field"><span>Country or territory</span><select v-model="country"><option value="">Anywhere</option><option v-for="item in COUNTRIES" :key="item.code" :value="item.code">{{item.name}}</option></select></label>
    <div class="row filters">
      <div class="chips" role="group" aria-label="Where">
        <button class="chip" :aria-pressed="scope === 'anywhere'" @click="selectScope('anywhere')">Anywhere</button>
        <button class="chip" :aria-pressed="scope === 'city'" @click="selectScope('city')">In {{ session.profile.currentCity }}</button>
        <button v-if="plus" class="chip" :aria-pressed="likes" @click="likes=!likes">Likes you</button>
        <button class="chip" :aria-pressed="arriving" @click="arriving = !arriving" :title="'Members arriving in ' + session.profile.currentCity + ' in the next 60 days'"> Arriving soon</button>
      </div>
      <select v-model="sport" aria-label="Filter by sport" class="grow" style="max-width:200px">
        <option value="">All sports</option>
        <option v-for="s in session.profile.sports" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <button type="button" class="locate-button" :disabled="locationBusy" @click="suggestCity">{{ locationBusy?'Finding your city…':'Use my location' }}</button>
    <p class="location-note">Uses your location once to suggest a city. Coordinates are not saved to your profile.</p>
    <p v-if="locationNotice" class="location-note" role="status">{{ locationNotice }}</p>
    <form class="row search" @submit.prevent="searchCity"><input type="search" v-model="draftCity" list="discover-cities" maxlength="60" placeholder="Search city" aria-label="Search city" class="grow"><datalist id="discover-cities"><option v-for="c in CITIES" :key="c" :value="c"/></datalist><select v-model="draftRadius" aria-label="Distance from city centre"><option value="">City only</option><option v-for="n in [25,50,100,250,500,1000,2000]" :key="n" :value="n">{{ n }} km</option></select><button class="btn sm">Search</button></form>
    <p v-if="radius" class="mute small">Distances are between city centres.</p><button class="btn block" @click="filtersOpen=false">Done</button></Modal>
    <p v-if="session.profile.paused" class="ok">Your profile is paused, so others cannot see you. <RouterLink to="/app/profile">Turn discovery back on</RouterLink>.</p>
    <p v-if="notice" class="ok" role="status">{{ notice }}</p>
    <p v-if="err" class="err" role="alert">{{ err }}</p><p v-if="err&&requestReference" class="request-reference">Reference: {{requestReference}}</p>

    <div v-if="loading && !people.length" class="discovery-loading" role="status" aria-live="polite" aria-busy="true">
      <div class="loading-brand"><img class="loading-mark" src="/logo-mark.svg" alt="" aria-hidden="true"><span>Finding your people…</span></div>
      <div class="loading-card-lines" aria-hidden="true"><i></i><i></i></div>
    </div>
    <div v-else-if="!people.length" class="discovery-empty">
      <div v-if="err" class="empty-result"><button class="btn sm" @click="load">Try again</button></div>
      <template v-else>
        <div class="empty-result"><div class="empty-result-copy"><h2>No new profiles right now</h2><p class="discovery-hint">Your own profile and people you’ve already liked or passed stay out of Discover. Connection modes and dating preferences still apply.</p><button v-if="country||sport||arriving||city||radius||likes" type="button" class="reset-filters" @click="resetFilters">Reset filters</button><button class="btn sm" @click="filtersOpen=true">Adjust search</button><RouterLink class="sessions-link" to="/app/events">Find a session</RouterLink></div></div>
        <section v-if="upcomingSession" class="upcoming-session"><h2>Meet at a session</h2><RouterLink to="/app/events" class="session-suggestion"><time :datetime="upcomingSession.startsAt"><b>{{ formatEventTime(upcomingSession.startsAt,upcomingSession.timezone).day }}</b><span>{{ formatEventTime(upcomingSession.startsAt,upcomingSession.timezone).time }}</span></time><div><h3>{{ upcomingSession.title }}</h3><p>{{ upcomingSession.city }} · {{ upcomingSession.kind }}</p></div><span class="session-action">View sessions</span></RouterLink></section>
      </template>
    </div>
    <div v-else class="people-workspace">
    <div class="discovery-stage" :aria-busy="busy">
      <Transition name="profile-change" mode="out-in">
      <ProfileCard :key="people[0].id" :person="people[0]" immersive portrait>
        <template #actions>
          <button class="decision pass" :disabled="busy" @click="swipe(false)" aria-label="Pass on this profile">Pass</button>
          <button class="decision like" :disabled="busy" @click="swipe(true)" aria-label="Like this profile. You match if they like you back.">Like</button>
        </template>
      </ProfileCard>
      </Transition>
      <button class="profile-report" @click="safety=people[0]">Block or report</button>
    </div>
    <aside class="discovery-context" aria-label="Local sessions">
      <RouterLink v-if="upcomingSession" to="/app/events" class="local-event"><span>{{ upcomingSession.title }}</span><time :datetime="upcomingSession.startsAt">{{ formatEventTime(upcomingSession.startsAt,upcomingSession.timezone).day }} · {{ upcomingSession.city }}</time><span class="session-action">View session</span></RouterLink>
      <RouterLink v-else to="/app/events" class="sessions-link">Find a session in {{ session.profile.currentCity }}</RouterLink>
    </aside>
    </div>

    <Modal v-if="match" label="A new connection" @close="match=null">
        <div class="matched-pair"><Avatar :person="session.profile" :size="94"/><Avatar :person="match.other" :size="94"/></div>
        <h2 id="mt" style="font-size:30px;margin:14px 0 6px">Found your pace.</h2>
        <p class="mute">You and {{ match.other.name }} want to connect.</p>
        <div class="stack">
          <button class="btn block" @click="router.push(`/app/matches/${match.id}`)">Send a message</button>
          <button class="btn ghost block" @click="match = null">Keep discovering</button>
        </div>
    </Modal>
    <ReportDialog v-if="safety" :person="safety" @close="safety = null" @done="onSafety" />
  </div>
</template>

<style scoped>
.discover-top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:6px 0 14px}
.discover-heading{font:600 34px/1.15 var(--display);letter-spacing:-.04em;margin:0}.discover-heading span{color:var(--coral)}
.filter-button{display:flex;align-items:center;gap:9px;min-height:44px;padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);font-size:12px;font-weight:600;cursor:pointer}
.filter-button i{width:6px;height:6px;background:var(--coral)}
.discovery-scope{display:flex;gap:26px;border-bottom:1px solid var(--line);margin-bottom:24px}
.discovery-scope button{border:0;border-bottom:2px solid transparent;background:none;padding:13px 0;min-height:44px;color:var(--mute);font-size:13px;cursor:pointer}
.discovery-scope .selected{border-bottom-color:var(--green);color:var(--ink);font-weight:600}
.people-workspace{max-width:820px;margin:0 auto}.discovery-stage{min-width:0}
.decision{flex:1;min-width:0;min-height:46px;display:flex;align-items:center;justify-content:center;border-radius:12px;padding:11px 18px;font:600 13px var(--body);cursor:pointer;box-shadow:none;transition:none}
.decision.pass{background:var(--bg);color:var(--ink);border:1px solid var(--line)}
.decision.like{background:var(--cta);color:var(--on);border:1px solid var(--cta)}
.decision:disabled{opacity:.5;cursor:wait}
.profile-report{display:block;margin:8px auto 0;min-height:40px;padding:10px;border:0;background:none;color:var(--mute);font-size:11px;cursor:pointer}
.discovery-context{border-top:1px solid var(--line);margin-top:4px;padding:16px 0}
.local-event{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;text-decoration:none;font-size:13px}
.local-event>span:first-child{font-weight:600}.local-event time{font-size:12px;color:var(--mute)}.session-action{margin-left:auto;color:var(--green);font-size:12px;font-weight:600}
.sessions-link{font-size:12px;color:var(--mute);text-underline-offset:4px}
.filter-title{font:600 26px var(--display);margin-bottom:24px}.filters{justify-content:space-between;gap:16px;margin-bottom:14px}.filters select{max-width:none!important;width:100%}
.locate-button{min-height:44px;padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);font:600 13px var(--body);cursor:pointer}.locate-button:disabled{opacity:.5;cursor:wait}.location-note{font-size:12px;line-height:1.6;color:var(--mute);margin:10px 0}.search{margin:18px 0;gap:8px;flex-wrap:wrap}.search input{width:100%;flex-basis:100%;min-width:0}.search select{width:auto;flex:1;min-width:0}
.matched-pair{display:flex;justify-content:center;padding:18px 0 8px}.matched-pair :deep(.av){outline:4px solid var(--card)}.matched-pair :deep(.av + .av){margin-left:-12px}
.discovery-loading{max-width:820px;margin:32px auto;color:var(--mute);font-size:14px}
.discovery-empty{width:100%;max-width:620px;margin:24px auto 0}.empty-result{padding:30px 0 36px;border-bottom:1px solid var(--line)}.empty-result-copy h2{font:600 28px/1.25 var(--display);letter-spacing:-.025em;margin:0 0 24px}.empty-result-copy .btn{margin-right:20px}
.upcoming-session{margin-top:30px}.upcoming-session>h2{font:500 16px var(--display);margin-bottom:18px;color:var(--mute)}
.session-suggestion{display:flex;gap:24px;align-items:center;padding:24px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);text-decoration:none}.session-suggestion time{display:flex;flex-direction:column;gap:5px;min-width:83px}.session-suggestion time b{font-size:13px}.session-suggestion time span{color:var(--mute);font-size:12px}.session-suggestion h3{font:600 23px/1.25 var(--display);margin:0}.session-suggestion p{font-size:13px;color:var(--mute);margin:8px 0 0}
@media(max-width:700px){.discover-top{margin-top:0}.discover-heading{font-size:30px}.discovery-scope{margin-bottom:18px;gap:24px}.local-event{gap:8px 16px}.local-event time{flex-basis:100%}.local-event .session-action{margin-left:0}.discovery-context{padding:14px 0 20px}.filter-button{padding:9px 12px}.empty-result-copy h2{font-size:25px}.session-suggestion{gap:16px;flex-wrap:wrap}.session-suggestion h3{font-size:21px}.session-suggestion .session-action{flex-basis:100%;margin-left:99px}}
</style>

<style scoped>
.discovery-loading{box-sizing:border-box;position:relative;display:flex;align-items:center;justify-content:center;min-height:380px;height:55vh;max-height:600px;max-width:520px;border:1px solid var(--line);border-radius:18px;background:var(--soft);overflow:hidden}.loading-brand{display:flex;flex-direction:column;align-items:center;gap:12px;color:var(--ink)}.loading-brand .loading-mark{width:32px;height:36px;object-fit:contain;color:var(--green);animation:brand-roll 2.4s linear infinite}.loading-brand span{font-size:13px;color:var(--mute)}.loading-card-lines{position:absolute;bottom:28px;left:24px;right:24px;display:grid;gap:10px}.loading-card-lines i{display:block;height:10px;width:55%;border-radius:6px;background:var(--line)}.loading-card-lines i+i{width:35%}
@keyframes brand-roll{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.loading-brand .loading-mark{animation:none}}
</style>

<style scoped>.discovery-hint{max-width:46ch;font-size:13px;line-height:1.7;color:var(--mute);margin:16px 0 22px}.reset-filters{display:block;min-height:44px;background:none;border:0;padding:8px 0;color:var(--green);font:600 13px var(--body);text-decoration:underline;cursor:pointer}</style>

<style scoped>.request-reference{font-size:11px;color:var(--mute);overflow-wrap:anywhere;margin:8px 0 18px}</style>

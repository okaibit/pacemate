<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useRouter } from "vue-router";
import { api, formatEventTime } from "../api.js";
import { session } from "../auth.js";
import Modal from "../components/Modal.vue";
import ProfileCard from "../components/ProfileCard.vue";
import ReportDialog from "../components/ReportDialog.vue";
import { CITIES } from "../options.js";
import Avatar from "../components/Avatar.vue";

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
const scope = ref("anywhere"), sport = ref(""), arriving = ref(false);
const city = ref(""), radius = ref(""), draftCity = ref(""), draftRadius = ref(""), likes = ref(false), plus = ref(false);
let sequence = 0;
function searchCity() { city.value=draftCity.value.trim();radius.value=draftRadius.value;load(); }
const match = ref(null), safety = ref(null), notice = ref("");

async function load() {
  const token=++sequence;
  loading.value = true; err.value = "";
  try {
    const q = new URLSearchParams({ scope: scope.value, ...(city.value ? {city:city.value}:{}), ...(radius.value ? {radius:radius.value}:{}), ...(likes.value ? {likes:"1"}:{}), ...(sport.value ? { sport: sport.value } : {}), ...(arriving.value ? { arriving: "1" } : {}) });
    const result=await api(`/api/discover?${q}`);if(token===sequence){people.value=result.people;if(!result.people.length)loadUpcomingSession();}
  } catch (e) { if(token===sequence)err.value = e.message; }
  finally { if(token===sequence)loading.value = false; }
}
watch([scope, sport, arriving, likes], load);
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
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="discover-page">
    <header class="discover-top"><h1 class="discover-heading">Discover<span>.</span></h1><button class="filter-button" @click="filtersOpen=true" aria-label="Discovery filters" aria-haspopup="dialog"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--card)"/><circle cx="15" cy="17" r="3" fill="var(--card)"/></svg><span>Filters</span><i v-if="sport||arriving||city||radius||likes"/></button></header>
    <div class="discovery-scope"><button :aria-pressed="scope==='anywhere'" :class="{selected:scope==='anywhere'}" @click="scope='anywhere'">Anywhere</button><button :aria-pressed="scope==='city'" :class="{selected:scope==='city'}" @click="scope='city'">{{ session.profile.currentCity }}</button><button v-if="plus" :aria-pressed="likes" :class="{selected:likes}" @click="likes=!likes">Likes you</button></div>
    <Modal v-if="filtersOpen" label="Discovery filters" @close="filtersOpen=false"><h2 class="filter-title">Your kind of people</h2>
    <div class="row filters">
      <div class="chips" role="group" aria-label="Where">
        <button class="chip" :aria-pressed="scope === 'anywhere'" @click="scope = 'anywhere'">Anywhere</button>
        <button class="chip" :aria-pressed="scope === 'city'" @click="scope = 'city'">In {{ session.profile.currentCity }}</button>
        <button v-if="plus" class="chip" :aria-pressed="likes" @click="likes=!likes">Likes you</button>
        <button class="chip" :aria-pressed="arriving" @click="arriving = !arriving" :title="'Members arriving in ' + session.profile.currentCity + ' in the next 60 days'"> Arriving soon</button>
      </div>
      <select v-model="sport" aria-label="Filter by sport" class="grow" style="max-width:200px">
        <option value="">All sports</option>
        <option v-for="s in session.profile.sports" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <form class="row search" @submit.prevent="searchCity"><input type="search" v-model="draftCity" list="discover-cities" maxlength="60" placeholder="Search city" aria-label="Search city" class="grow"><datalist id="discover-cities"><option v-for="c in CITIES" :key="c" :value="c"/></datalist><select v-model="draftRadius" aria-label="Distance from city centre"><option value="">City only</option><option v-for="n in [25,50,100,250,500,1000,2000]" :key="n" :value="n">{{ n }} km</option></select><button class="btn sm">Search</button></form>
    <p v-if="radius" class="mute small">Distances are between city centres.</p><button class="btn block" @click="filtersOpen=false">Done</button></Modal>
    <p v-if="session.profile.paused" class="ok">Your profile is paused, so others cannot see you. <RouterLink to="/app/profile">Turn discovery back on</RouterLink>.</p>
    <p v-if="notice" class="ok" role="status">{{ notice }}</p>
    <p v-if="err" class="err" role="alert">{{ err }}</p>

    <div v-if="loading && !people.length" class="discovery-loading" role="status" aria-label="Loading profiles" aria-busy="true"><span class="sr-only">Loading profiles</span><div class="loading-photo" aria-hidden="true"></div><div class="loading-line" aria-hidden="true"></div><div class="loading-line short" aria-hidden="true"></div></div>
    <div v-else-if="!people.length" class="discovery-empty">
      <div v-if="err" class="empty-result"><button class="btn sm" @click="load">Try again</button></div>
      <template v-else>
        <div class="empty-result"><div class="empty-result-copy"><h2>No new profiles right now</h2><button class="btn sm" @click="filtersOpen=true">Adjust search</button><RouterLink class="sessions-link" to="/app/events">Find a session</RouterLink></div></div>
        <section v-if="upcomingSession" class="upcoming-session"><h2>Meet at a session</h2><RouterLink to="/app/events" class="session-suggestion"><time :datetime="upcomingSession.startsAt"><b>{{ formatEventTime(upcomingSession.startsAt,upcomingSession.timezone).day }}</b><span>{{ formatEventTime(upcomingSession.startsAt,upcomingSession.timezone).time }}</span></time><div><h3>{{ upcomingSession.title }}</h3><p>{{ upcomingSession.city }} · {{ upcomingSession.kind }}</p></div><span class="session-action">View sessions</span></RouterLink></section>
      </template>
    </div>
    <div v-else class="people-workspace">
    <div class="discovery-stage" :aria-busy="busy">
      <Transition name="profile-change" mode="out-in">
      <ProfileCard :key="people[0].id" :person="people[0]" immersive portrait>
        <template #actions>
          <button class="decision pass" :disabled="busy" @click="swipe(false)" aria-label="Pass on this profile">Pass</button>
          <button class="decision connect" :disabled="busy" @click="swipe(true)" aria-label="Like this profile and connect if they like you back">Connect</button>
        </template>
      </ProfileCard>
      </Transition>
      <button class="profile-report" @click="safety=people[0]">Block or report</button>
    </div>
    <aside class="discovery-context" aria-label="Your connection preferences and local sessions">
      <div v-if="session.profile.goal" class="your-intent"><p>Looking for</p><h2>{{ session.profile.goal }}</h2><RouterLink to="/app/profile">Edit preference</RouterLink></div>
      <section class="local-session"><p class="local-city">{{ session.profile.currentCity }}</p><h2>Make a plan.</h2><RouterLink v-if="upcomingSession" to="/app/events" class="local-event"><time :datetime="upcomingSession.startsAt">{{ formatEventTime(upcomingSession.startsAt,upcomingSession.timezone).day }} · {{ formatEventTime(upcomingSession.startsAt,upcomingSession.timezone).time }}</time><h3>{{ upcomingSession.title }}</h3><p>{{ upcomingSession.kind }} · {{ upcomingSession.city }}</p><span>View sessions</span></RouterLink><RouterLink v-else to="/app/events" class="local-event"><span>Find or host a session</span></RouterLink></section>
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
.filters{justify-content:space-between;margin-bottom:14px}
.acts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
.big{padding:16px;font-size:18px}
.center{text-align:center}
.empty h2{font-size:26px;margin-bottom:8px}
@media (hover:none){.hint{display:none}}
.search{margin-bottom:14px}.search input{min-width:140px;width:0}.search select{width:auto;max-width:140px}
</style>

<style scoped>
.discover-heading{font-size:clamp(34px,4vw,46px);letter-spacing:-.045em;margin:16px 0 28px}.discover-heading span{color:var(--coral)}.filters{gap:14px;margin-bottom:12px}.filters select{font-size:13px}.search{background:var(--card);border:1px solid var(--line);padding:9px;border-radius:12px;margin-bottom:26px;flex-wrap:nowrap;gap:8px}.search input{border:0!important;background:transparent!important;min-width:60px}.search select{border:0;background-color:var(--bg);font-size:13px;max-width:130px}.search button{flex-shrink:0}
.empty{display:grid;grid-template-columns:1fr 1fr;overflow:hidden;padding:0!important;border:0;min-height:420px;background:var(--soft);}.empty-photo{background:url('/images/hero.jpg') center 51%/cover;min-height:330px}.empty-content{display:flex;flex-direction:column;justify-content:center;padding:36px}.empty h2{font-size:clamp(28px,3vw,38px);letter-spacing:-.04em;line-height:1.08}.empty p{font-size:14px;line-height:1.75;margin:18px 0 26px}.empty .row{gap:10px}.empty .btn{font-size:13px;padding:12px 15px}.empty .btn.ghost{border-color:color-mix(in srgb,var(--ink) 20%,transparent)}
.discover-page>:deep(.pc){max-width:560px;margin-left:auto;margin-right:auto}.acts,.center{max-width:560px;margin-left:auto;margin-right:auto}
@media(max-width:600px){.empty{grid-template-columns:1fr;min-height:0}.empty-photo{min-height:230px;max-height:260px;background-position:center 44%}.empty-content{padding:28px}.empty h2{font-size:32px}.filters .chips{gap:6px}.filters .chip{font-size:12px;padding:8px 11px}.search{gap:4px}.search select{max-width:100px}.search .btn{padding:10px 12px}.discover-heading{margin-bottom:20px}}
</style>

<style scoped>
.discover-top{display:flex;justify-content:space-between;align-items:center;gap:15px;margin:12px 0 14px}.discover-heading{margin:0;font-size:36px}.filter-button{display:flex;align-items:center;gap:9px;padding:11px 15px;border:1px solid var(--line);border-radius:12px;background:var(--card);font-size:13px;font-weight:600;cursor:pointer}.filter-button i{width:6px;height:6px;background:var(--coral);border-radius:12px}.discovery-scope{display:flex;gap:26px;border-bottom:1px solid var(--line);margin-bottom:24px}.discovery-scope button{position:relative;border:0;background:transparent;padding:13px 0;color:var(--mute);font-size:14px;cursor:pointer}.discovery-scope .selected{color:var(--ink);font-weight:700}.discovery-scope .selected:after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:3px;border-radius:12px;background:var(--green)}.discovery-stage{max-width:940px;margin:0 auto}.decision{width:66px;height:66px;display:grid;place-items:center;border-radius:12px;border:1px solid #ffffff40;cursor:pointer;transition:none}.decision:hover:not(:disabled){}.decision:disabled{opacity:.5;cursor:wait}.decision svg{width:27px;height:27px}.pass{background:var(--card);color:#304a3c}.like{background:#e6edc9;color:#244c35;width:76px;height:76px;border-color:#e6edc9}.like svg{width:30px;height:30px}.profile-report{display:block;border:0;background:none;color:var(--mute);font-size:12px;margin:18px auto;cursor:pointer;padding:6px}.profile-report:hover{text-decoration:underline}.filter-title{font-size:26px;margin-bottom:24px}.filters{gap:18px}.filters select{max-width:none!important;width:100%}.search{margin-top:18px;padding:6px;flex-wrap:wrap}.search input{width:100%;flex-basis:100%}.matched-pair{display:flex;justify-content:center;padding:18px 0 8px}.matched-pair :deep(.av){outline:5px solid var(--card);}.matched-pair :deep(.av)+:deep(.av){margin-left:-14px;transform:none}.profile-change-enter-active,.profile-change-leave-active{transition:none}.profile-change-enter-from{opacity:0;transform:translateY(8px)}.profile-change-leave-to{opacity:0;transform:translateY(-6px)}
@media(max-width:700px){.discover-top{margin-top:4px}.discover-heading{font-size:30px}.discovery-scope{margin-bottom:18px;gap:24px}.filter-button{font-size:12px;padding:10px 13px}.empty-photo{min-height:260px}.empty h2{font-size:30px}}
@media(max-width:700px){}
</style>


<style scoped>
.discover-heading{font-size:clamp(34px,4vw,46px);letter-spacing:-.045em;margin:16px 0 28px}.discover-heading span{color:var(--coral)}.filters{gap:14px;margin-bottom:12px}.filters select{font-size:13px}.search{background:var(--card);border:1px solid var(--line);padding:9px;border-radius:18px;margin-bottom:26px;flex-wrap:nowrap;gap:8px}.search input{border:0!important;background:transparent!important;min-width:60px}.search select{border:0;background-color:var(--bg);font-size:13px;max-width:130px}.search button{flex-shrink:0}
.empty{display:grid;grid-template-columns:1fr 1fr;overflow:hidden;padding:0!important;border:0;min-height:420px;background:var(--soft);box-shadow:none!important}.empty-photo{background:url('/images/hero.jpg') center 51%/cover;min-height:330px}.empty-content{display:flex;flex-direction:column;justify-content:center;padding:36px}.empty h2{font-size:clamp(28px,3vw,38px);letter-spacing:-.04em;line-height:1.08}.empty p{font-size:14px;line-height:1.75;margin:18px 0 26px}.empty .row{gap:10px}.empty .btn{font-size:13px;padding:12px 15px}.empty .btn.ghost{border-color:color-mix(in srgb,var(--ink) 20%,transparent)}
.discover-page>:deep(.pc){max-width:560px;margin-left:auto;margin-right:auto}.acts,.center{max-width:560px;margin-left:auto;margin-right:auto}
@media(max-width:600px){.empty{grid-template-columns:1fr;min-height:0}.empty-photo{min-height:230px;max-height:260px;background-position:center 44%}.empty-content{padding:28px}.empty h2{font-size:32px}.filters .chips{gap:6px}.filters .chip{font-size:12px;padding:8px 11px}.search{gap:4px}.search select{max-width:100px}.search .btn{padding:10px 12px}.discover-heading{margin-bottom:20px}}
</style>

<style scoped>
.discover-top{display:flex;justify-content:space-between;align-items:center;gap:15px;margin:12px 0 14px}.discover-heading{margin:0;font-size:36px}.filter-button{display:flex;align-items:center;gap:9px;padding:11px 15px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:13px;font-weight:600;cursor:pointer}.filter-button i{width:6px;height:6px;background:var(--coral);border-radius:50%}.discovery-scope{display:flex;gap:26px;border-bottom:1px solid var(--line);margin-bottom:24px}.discovery-scope button{position:relative;border:0;background:transparent;padding:13px 0;color:var(--mute);font-size:14px;cursor:pointer}.discovery-scope .selected{color:var(--ink);font-weight:700}.discovery-scope .selected:after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:3px;border-radius:3px;background:var(--green)}.discovery-stage{max-width:940px;margin:0 auto}.decision{width:66px;height:66px;display:grid;place-items:center;border-radius:50%;border:1px solid #ffffff40;cursor:pointer;box-shadow:0 6px 22px #0002;transition:transform .18s,opacity .18s}.decision:hover:not(:disabled){transform:scale(1.07)}.decision:disabled{opacity:.5;cursor:wait}.decision svg{width:27px;height:27px}.pass{background:#fff;color:#304a3c}.like{background:#e6edc9;color:#244c35;width:76px;height:76px;border-color:#e6edc9}.like svg{width:30px;height:30px}.profile-report{display:block;border:0;background:none;color:var(--mute);font-size:12px;margin:18px auto;cursor:pointer;padding:6px}.profile-report:hover{text-decoration:underline}.filter-title{font-size:26px;margin-bottom:24px}.filters{gap:18px}.filters select{max-width:none!important;width:100%}.search{margin-top:18px;padding:6px;flex-wrap:wrap}.search input{width:100%;flex-basis:100%}.matched-pair{display:flex;justify-content:center;padding:18px 0 8px}.matched-pair :deep(.av){outline:5px solid var(--card);box-shadow:0 0 0 7px var(--soft)}.matched-pair :deep(.av)+:deep(.av){margin-left:-14px;transform:rotate(8deg)}.profile-change-enter-active,.profile-change-leave-active{transition:opacity .18s,transform .18s}.profile-change-enter-from{opacity:0;transform:translateY(8px)}.profile-change-leave-to{opacity:0;transform:translateY(-6px)}
@media(max-width:700px){.discover-top{margin-top:4px}.discover-heading{font-size:30px}.discovery-scope{margin-bottom:18px;gap:24px}.filter-button{font-size:12px;padding:10px 13px}.empty-photo{min-height:260px}.empty h2{font-size:30px}}@media(max-width:700px){}@media(max-width:700px){}</style>

<style scoped>
.empty-result{display:flex;align-items:flex-start;gap:20px;padding:38px 0 42px;border-bottom:1px solid var(--line)}.empty-result-copy h2{font:600 clamp(22px,2.5vw,28px)/1.25 var(--display);letter-spacing:-.025em;margin:0 0 22px}.empty-result-copy .btn{margin-right:20px}.sessions-link{font-size:12px;text-decoration:none;color:var(--mute);font-weight:600}.sessions-link:hover{text-decoration:underline}.upcoming-session{margin-top:32px}.upcoming-session>h2{font:600 18px var(--display);margin-bottom:18px}.session-suggestion{display:flex;gap:24px;align-items:center;padding:22px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);text-decoration:none}.session-suggestion time{display:flex;flex-direction:column;gap:5px;min-width:90px}.session-suggestion time b{font-size:13px}.session-suggestion time span{color:var(--mute);font-size:12px}.session-suggestion h3{font:600 20px var(--display);margin:0}.session-suggestion p{font-size:12px;color:var(--mute);margin:6px 0 0}.session-action{margin-left:auto;font-size:12px;color:var(--green);font-weight:600;white-space:nowrap}
@media(max-width:600px){.empty-result{padding:30px 0;gap:15px}.empty-result-copy h2{font-size:23px;max-width:15ch}.empty-result-copy .btn{margin-right:13px}.sessions-link{font-size:11px}.session-suggestion{gap:15px;flex-wrap:wrap}.session-action{flex-basis:100%;margin-left:105px}.session-suggestion h3{font-size:18px}}
</style>

<style scoped>
.people-workspace{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:38px;align-items:start;padding-top:8px}.people-workspace .discovery-stage{width:100%;max-width:none;margin:0}.decision{width:auto!important;height:auto!important;min-width:112px;min-height:45px;display:flex;align-items:center;justify-content:center;border-radius:4px!important;box-shadow:none!important;font:600 13px var(--body);padding:12px 20px;transition:none!important}.decision:hover:not(:disabled){transform:none!important}.decision.pass{background:#f3f1e8;color:#244f3b;border:1px solid #f3f1e8}.decision.connect{background:#244f3b;color:#fff;border:1px solid #a3b29b}.profile-report{margin:12px auto;font-size:10px}.discovery-context{padding-top:8px}.your-intent{padding:0 0 28px;border-bottom:1px solid var(--line)}.your-intent>p,.local-city{font-size:11px;color:var(--mute);margin:0 0 12px}.your-intent h2,.local-session>h2{font:600 24px/1.15 var(--display);letter-spacing:-.025em;margin:0 0 18px}.your-intent>a{font-size:11px;color:var(--mute);text-underline-offset:4px}.local-session{padding-top:28px}.local-event{display:block;text-decoration:none;padding-top:20px;border-top:1px solid var(--line)}.local-event time{font-size:10px;color:var(--green);font-weight:600;line-height:1.7}.local-event h3{font:600 19px/1.25 var(--display);margin:13px 0 10px}.local-event p{font-size:11px;color:var(--mute);margin:0 0 20px}.local-event span{font-size:11px;color:var(--green);font-weight:600}
@media(max-width:1200px){.people-workspace{grid-template-columns:minmax(0,1fr);gap:20px}.discovery-context{display:flex;justify-content:center;gap:30px;max-width:440px;width:100%;margin:0 auto}.your-intent{border:0;padding:0;flex:1}.local-session{border-left:1px solid var(--line);padding:0 0 0 25px;flex:1}.your-intent h2,.local-session>h2{font-size:20px}.local-event{padding-top:14px}.local-event h3{font-size:17px}}
@media(max-width:700px){.people-workspace{padding-top:0}.discovery-context{max-width:460px}.decision{min-width:110px;min-height:44px}.your-intent h2,.local-session>h2{font-size:18px}}
</style>

<style scoped>.discovery-loading{width:100%;max-width:440px;margin:8px auto 30px}.loading-photo{height:clamp(440px,65svh,630px);background:var(--soft)}.loading-line{height:12px;width:70%;background:var(--line);margin-top:18px}.loading-line.short{width:40%;height:9px;margin-top:12px}</style>

<style scoped>
.discovery-empty{width:100%;max-width:620px;margin:32px auto 0}.discovery-empty .empty-result{padding:30px 0 36px}.discovery-empty .empty-result-copy h2{font-size:28px;line-height:1.25;margin-bottom:24px}.discovery-empty .upcoming-session{margin-top:30px}.discovery-empty .upcoming-session>h2{font-size:16px;font-weight:500;color:var(--mute)}.discovery-empty .session-suggestion{gap:25px;padding:24px 0}.discovery-empty .session-suggestion h3{font-size:23px;line-height:1.25}.discovery-empty .session-suggestion p{font-size:13px;margin-top:8px}.discovery-empty .session-suggestion time{min-width:83px}.discovery-empty .session-action{font-size:12px}
@media(max-width:600px){.discovery-empty{margin-top:16px}.discovery-empty .empty-result-copy h2{font-size:25px;max-width:none}.discovery-empty .session-suggestion{gap:18px}.discovery-empty .session-suggestion h3{font-size:21px}.discovery-empty .session-action{margin-left:101px}}
</style>

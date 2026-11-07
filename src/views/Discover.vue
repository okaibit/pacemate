<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api.js";
import { session } from "../auth.js";
import Modal from "../components/Modal.vue";
import ProfileCard from "../components/ProfileCard.vue";
import ReportDialog from "../components/ReportDialog.vue";
import { CITIES } from "../options.js";
import Avatar from "../components/Avatar.vue";

const router = useRouter();
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
    const result=await api(`/api/discover?${q}`);if(token===sequence)people.value=result.people;
  } catch (e) { if(token===sequence)err.value = e.message; }
  finally { if(token===sequence)loading.value = false; }
}
watch([scope, sport, arriving, likes], load);
onMounted(()=>{load();api("/api/billing/config").then(b=>plus.value=b.active).catch(()=>{});});

async function swipe(liked) {
  const p = people.value[0];
  if (!p || busy.value) return;
  busy.value = true; err.value = ""; notice.value = "";
  try {
    const r = await api("/api/swipes", { method: "POST", body: { targetId: p.id, liked } });
    people.value.shift();
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
  if (match.value || safety.value || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)) return;
  if (e.key === "ArrowLeft") swipe(false);
  if (e.key === "ArrowRight") swipe(true);
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div>
    <div class="row filters">
      <div class="chips" role="group" aria-label="Where">
        <button class="chip" :aria-pressed="scope === 'anywhere'" @click="scope = 'anywhere'">Anywhere</button>
        <button class="chip" :aria-pressed="scope === 'city'" @click="scope = 'city'">In {{ session.profile.currentCity }}</button>
        <button v-if="plus" class="chip" :aria-pressed="likes" @click="likes=!likes">Likes you</button>
        <button class="chip" :aria-pressed="arriving" @click="arriving = !arriving" :title="'Members arriving in ' + session.profile.currentCity + ' in the next 60 days'">✈ Arriving soon</button>
      </div>
      <select v-model="sport" aria-label="Filter by sport" class="grow" style="max-width:200px">
        <option value="">All sports</option>
        <option v-for="s in session.profile.sports" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <form class="row search" @submit.prevent="searchCity"><input v-model="draftCity" list="discover-cities" maxlength="60" placeholder="Search city" aria-label="Search city" class="grow"><datalist id="discover-cities"><option v-for="c in CITIES" :key="c" :value="c"/></datalist><select v-model="draftRadius" aria-label="Distance from city centre"><option value="">City only</option><option v-for="n in [25,50,100,250,500,1000,2000]" :key="n" :value="n">{{ n }} km</option></select><button class="btn sm">Search</button></form>
    <p v-if="radius" class="mute small">Distances are between city centres.</p>
    <p v-if="session.profile.paused" class="ok">Your profile is paused, so others cannot see you. <RouterLink to="/app/profile">Turn discovery back on</RouterLink>.</p>
    <p v-if="notice" class="ok" role="status">{{ notice }}</p>
    <p v-if="err" class="err" role="alert">{{ err }}</p>

    <div v-if="loading && !people.length" class="spinner" aria-label="Loading"></div>
    <div v-else-if="!people.length" class="card empty">
      <h2>You are all caught up</h2>
      <p v-if="arriving" class="mute">Nobody new is arriving in {{ session.profile.currentCity }} in the next 60 days. Turn off "Arriving soon" to see everyone.</p>
      <p v-else class="mute">No new people match your filters right now. Try "Anywhere", widen your age range, or join a session to meet people in person.</p>
      <div class="row"><RouterLink class="btn" to="/app/events">Browse events</RouterLink><RouterLink class="btn ghost" to="/app/profile">Edit preferences</RouterLink></div>
    </div>
    <template v-else>
      <ProfileCard :person="people[0]">
        <p v-if="people[0].distanceKm !== null" class="mute small">{{ people[0].distanceKm }} km away</p>
        <p v-if="people[0].shared" class="mute small" style="margin:12px 0 0">You share {{ people[0].shared }} {{ people[0].shared === 1 ? "sport" : "sports" }}.</p>
      </ProfileCard>
      <div class="acts">
        <button class="btn ghost big" :disabled="busy" @click="swipe(false)" aria-label="Pass">Pass</button>
        <button class="btn big" :disabled="busy" @click="swipe(true)" aria-label="Like">Like</button>
      </div>
      <p class="center"><button class="link small" @click="safety = people[0]">Block or report</button></p>
      <p class="center mute small hint">Tip: use ← and → keys on desktop.</p>
    </template>

    <Modal v-if="match" label="It’s a match" @close="match=null">
        <Avatar :person="match.other" :size="96" />
        <h2 id="mt" style="font-size:30px;margin:14px 0 6px">It's a match!</h2>
        <p class="mute">You and {{ match.other.name }} like each other. Plan a session together.</p>
        <div class="stack">
          <button class="btn block" @click="router.push(`/app/matches/${match.id}`)">Send a message</button>
          <button class="btn ghost block" @click="match = null">Keep browsing</button>
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

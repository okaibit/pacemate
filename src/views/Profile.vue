<script setup>
import { reactive, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api.js";
import {disablePush} from '../composables/usePush.js';
import { session, logout } from "../auth.js";
import { GENDERS, GOALS, LEVELS, ROUTINES, WORK, SPORTS, CITIES, utcToday, tripMaxDate } from "../options.js";
import PhotoManager from "../components/PhotoManager.vue";
import Modal from "../components/Modal.vue";
import ProfileCard from "../components/ProfileCard.vue";

const router = useRouter();
const p = session.profile;
const f = reactive({
  name: p.name, birthdate: p.birthdate, gender: p.gender, interestedIn: [...p.interestedIn], ageMin: p.ageMin, ageMax: p.ageMax,
  goal: p.goal, sports: [...p.sports], level: p.level, routine: p.routine, workStyle: p.workStyle,
  homeCity: p.homeCity, currentCity: p.currentCity, nextCity: p.nextCity || "", nextArrival: p.nextArrival || "", bio: p.bio, photos: [...p.photos], paused: p.paused,
});
const photoBusy=ref(false);
const busy = ref(false), err = ref(""), saved = ref(false), preview = ref(false), del = ref(false), delText = ref("");
const toggle = (arr, v, max = 99) => { const i = arr.indexOf(v); i > -1 ? arr.splice(i, 1) : arr.length < max && arr.push(v); };
const asPublic = computed(() => ({ ...session.profile, ...f, age: session.profile.age, verified: session.profile.verified && JSON.stringify(f.photos)===JSON.stringify(session.profile.photos) }));

async function save() {
  if(photoBusy.value)return;
  busy.value = true; err.value = ""; saved.value = false;
  try {
    session.profile = (await api("/api/me", { method: "PUT", body: f })).profile;
    saved.value = true;
  } catch (e) { err.value = e.message; }
  finally { busy.value = false; }
}
async function clearTrip() {
  const before = { nextCity: f.nextCity, nextArrival: f.nextArrival };
  f.nextCity = ""; f.nextArrival = "";
  if (session.profile.nextCity) { await save(); if (err.value) Object.assign(f, before); }
}
async function signOut() { try { await logout(); router.replace("/"); } catch(e) { err.value=e.message; } }
async function deleteAccount() {
  busy.value = true;
  try { await disablePush(); await api("/api/me", { method: "DELETE" }); await logout(); router.replace("/"); }
  catch (e) { err.value = e.message; busy.value = false; }
}
</script>

<template>
  <div>
    <div class="row" style="justify-content:space-between;margin-bottom:14px">
      <h1 class="h">Your profile</h1>
      <div class="row"><RouterLink class="btn ghost sm" to="/app/settings">Settings</RouterLink><button class="btn ghost sm" @click="preview = true">Preview</button></div>
    </div>
    <form @submit.prevent="save" class="stack">
      <section class="card"><h2>Photos</h2><PhotoManager v-model="f.photos" @busy="photoBusy=$event" /></section>

      <section class="card">
        <h2>About you</h2>
        <label class="field"><span>Name</span><input type="text" v-model="f.name" maxlength="30"></label>
        <label class="field"><span>Bio</span><textarea v-model="f.bio" maxlength="500"></textarea></label>
        <label class="field"><span>Gender</span><select v-model="f.gender"><option v-for="g in GENDERS" :key="g">{{ g }}</option></select></label>
        <label class="field"><span>Looking for</span><select v-model="f.goal"><option v-for="g in GOALS" :key="g">{{ g }}</option></select></label>
        <p class="mute small">Age {{ session.profile.age }}. To correct your date of birth, contact support.</p>
      </section>

      <section class="card">
        <h2>Sports and routine</h2>
        <p class="lbl">Sports (up to 8)</p>
        <div class="chips"><button type="button" v-for="s in SPORTS" :key="s" class="chip" :aria-pressed="f.sports.includes(s)" @click="toggle(f.sports, s, 8)">{{ s }}</button></div>
        <p class="lbl">Level</p>
        <div class="chips"><button type="button" v-for="l in LEVELS" :key="l" class="chip" :aria-pressed="f.level === l" @click="f.level = f.level === l ? '' : l">{{ l }}</button></div>
        <p class="lbl">When you train</p>
        <div class="chips"><button type="button" v-for="r in ROUTINES" :key="r" class="chip" :aria-pressed="f.routine === r" @click="f.routine = f.routine === r ? '' : r">{{ r }}</button></div>
        <p class="lbl">How you work</p>
        <div class="chips"><button type="button" v-for="w in WORK" :key="w" class="chip" :aria-pressed="f.workStyle === w" @click="f.workStyle = f.workStyle === w ? '' : w">{{ w }}</button></div>
      </section>

      <section class="card">
        <h2>Location</h2>
        <datalist id="pcities"><option v-for="c in CITIES" :key="c" :value="c" /></datalist>
        <label class="field"><span>Home city</span><input type="text" v-model="f.homeCity" list="pcities" maxlength="60"></label>
        <label class="field"><span>Where you are now</span><input type="text" v-model="f.currentCity" list="pcities" maxlength="60"></label>
        <p class="lbl">Planning a trip?</p>
        <p class="mute small" style="margin:0 0 8px">People in that city can match with you before you arrive. Members see only the city and date.</p>
        <div class="row">
          <label class="field grow"><span>Heading to</span><input type="text" v-model="f.nextCity" list="pcities" maxlength="60" placeholder="e.g. Lisbon"></label>
          <label class="field grow"><span>Arriving on</span><input type="date" v-model="f.nextArrival" :min="utcToday()" :max="tripMaxDate()"></label>
        </div>
        <button v-if="f.nextCity || f.nextArrival" type="button" class="btn ghost sm" :disabled="busy||photoBusy" @click="clearTrip">Clear trip</button>
      </section>

      <section class="card">
        <h2>Discovery preferences</h2>
        <p class="lbl">Show me</p>
        <div class="chips"><button type="button" v-for="g in GENDERS" :key="g" class="chip" :aria-pressed="f.interestedIn.includes(g)" @click="toggle(f.interestedIn, g)">{{ g }}</button></div>
        <div class="row" style="margin-top:12px">
          <label class="field grow"><span>From age</span><input type="number" min="18" max="99" v-model.number="f.ageMin"></label>
          <label class="field grow"><span>To age</span><input type="number" min="18" max="99" v-model.number="f.ageMax"></label>
        </div>
        <label class="row"><input type="checkbox" v-model="f.paused" style="width:20px;height:20px"> Pause my profile (hide me from Discover, keep my matches)</label>
      </section>

      <p v-if="err" class="err" role="alert">{{ err }}</p>
      <p v-if="saved" class="ok" role="status">Saved.</p>
      <button class="btn block" :disabled="busy||photoBusy">{{ busy ? "Saving…" : photoBusy ? "Uploading…" : "Save changes" }}</button>
    </form>

    <section class="card stack" style="margin-top:24px">
      <h2>Account</h2>
      <p class="mute small" style="margin:0">Signed in as {{ session.user?.email }}</p>
      <div class="row">
        <button class="btn ghost" @click="signOut">Log out</button>
        <RouterLink class="btn ghost" to="/safety">Safety tips</RouterLink>
      </div>
      <p class="small" style="margin:0"><RouterLink to="/privacy">Privacy</RouterLink> · <RouterLink to="/terms">Terms</RouterLink></p>
      <button v-if="!del" class="link" style="color:var(--danger);text-align:left" @click="del = true">Delete my account</button>
      <div v-else class="stack">
        <p style="margin:0">This cancels any active subscription and permanently deletes your profile, photos, matches and messages. Type <b>DELETE</b> to confirm.</p>
        <input type="text" v-model="delText" aria-label="Type DELETE to confirm">
        <div class="row">
          <button class="btn ghost" @click="del = false; delText = ''">Cancel</button>
          <button class="btn danger" :disabled="delText !== 'DELETE' || busy" @click="deleteAccount">Delete forever</button>
        </div>
      </div>
    </section>

    <Modal v-if="preview" label="Profile preview" flush @close="preview=false">
        <ProfileCard :person="asPublic"><button class="btn block" style="margin-top:14px" @click="preview = false">Close preview</button></ProfileCard>
    </Modal>
  </div>
</template>

<style scoped>
.h{font-size:30px}
h2{font-size:20px;margin-bottom:12px}
.lbl{font-weight:700;font-size:14px;margin:16px 0 8px}
</style>

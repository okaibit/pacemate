<script setup>
import { reactive, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api.js";
import { session, logout } from "../auth.js";
import { GENDERS, GOALS, LEVELS, ROUTINES, WORK, SPORTS, CITIES, sameCity, utcToday, tripMaxDate } from "../options.js";
import PhotoManager from "../components/PhotoManager.vue";

const router = useRouter();
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(undefined, { month: "long" }));
const YEARS = Array.from({ length: 82 }, (_, i) => new Date().getFullYear() - 18 - i);

const f = reactive({
  name: session.user?.name || "", m: "", d: "", y: "", gender: "", interestedIn: [], ageMin: 18, ageMax: 45,
  goal: "", sports: [], level: "", routine: "", workStyle: "", homeCity: "", currentCity: "", nextCity: "", nextArrival: "", bio: "", photos: [],
});
const steps = [
  { k: "name", t: "What should we call you?", sub: "This is how you appear to other members." },
  { k: "birth", t: "When is your birthday?", sub: "Members see your age, never your date of birth." },
  { k: "gender", t: "How do you identify?", sub: "" },
  { k: "into", t: "Who do you want to meet?", sub: "Pick one or more, and an age range." },
  { k: "goal", t: "What are you here for?", sub: "You can change this any time." },
  { k: "sports", t: "Your sports", sub: "Pick up to 8. People who share them show up first." },
  { k: "routine", t: "How do you train?", sub: "Optional, but it helps find people whose schedule fits yours." },
  { k: "city", t: "Where are you based?", sub: "Home is where you live. Now is where you are this month, if different." },
  { k: "trip", t: "Planning a trip?", sub: "Say where you're heading next and when. People there can match with you before you land." },
  { k: "photos", t: "Add your photos", sub: "Profiles with photos get far more matches." },
  { k: "bio", t: "Say a little about yourself", sub: "Your next goal race, favourite trail, or ideal first date." },
];
const photoBusy=ref(false);
const step = ref(0), err = ref(""), busy = ref(false);
const cur = computed(() => steps[step.value]);
const pad = (n) => String(n).padStart(2, "0");
const birthdate = () => `${f.y}-${pad(+f.m + 1)}-${pad(f.d)}`;
const toggle = (arr, v, max = 99) => { const i = arr.indexOf(v); i > -1 ? arr.splice(i, 1) : arr.length < max && arr.push(v); };

function check() {
  switch (cur.value.k) {
    case "name": return f.name.trim().length < 2 ? "Enter your name." : "";
    case "birth": {
      if (f.m === "" || !f.d || !f.y) return "Pick your full date of birth.";
      const dt = new Date(Date.UTC(f.y, f.m, f.d));
      if (dt.getUTCMonth() !== +f.m) return "That date does not exist.";
      const t = new Date(); let a = t.getFullYear() - f.y;
      if (t.getMonth() < +f.m || (t.getMonth() === +f.m && t.getDate() < f.d)) a--;
      return a < 18 ? "You must be 18 or older to use Pacemate." : "";
    }
    case "gender": return f.gender ? "" : "Pick one.";
    case "into": return !f.interestedIn.length ? "Pick at least one." : f.ageMin > f.ageMax ? "The minimum age is above the maximum." : "";
    case "goal": return f.goal ? "" : "Pick one.";
    case "sports": return f.sports.length ? "" : "Pick at least one sport.";
    case "city": return f.homeCity.trim() ? "" : "Add your home city.";
    case "trip": {
      const c = f.nextCity.trim(), d = f.nextArrival;
      if (!c && !d) return "";
      if (!c) return "Add the city you're travelling to, or skip this step.";
      if (!d) return "Add your arrival date, or skip this step.";
      if (d < utcToday()) return "Your arrival date can't be in the past.";
      if (d > tripMaxDate()) return "Your arrival date must be within the next 12 months.";
      if (sameCity(c, f.currentCity.trim() || f.homeCity)) return "That's where you are now. Pick a different trip city.";
      return "";
    }
  }
  return "";
}

async function next() {
  if(photoBusy.value)return;
  err.value = check();
  if (err.value) return;
  if (step.value < steps.length - 1) { step.value++; return; }
  busy.value = true;
  try {
    const { m, d, y, ...rest } = f;
    const { profile } = await api("/api/me", { method: "PUT", body: { ...rest, birthdate: birthdate() } });
    session.profile = profile;
    router.replace("/app/today");
  } catch (e) { err.value = e.message; }
  finally { busy.value = false; }
}
function skipTrip() { f.nextCity = ""; f.nextArrival = ""; err.value = ""; step.value++; }
async function signOut() { await logout(); router.replace("/"); }
</script>

<template>
  <main class="ob">
    <div class="narrow">
      <div class="top">
        <button v-if="step > 0" class="lnk" @click="step--; err = ''">← Back</button><span v-else></span>
        <button class="lnk" @click="signOut">Log out</button>
      </div>
      <div class="bar" role="progressbar" :aria-valuenow="step + 1" aria-valuemin="1" :aria-valuemax="steps.length"><i :style="{ width: ((step + 1) / steps.length) * 100 + '%' }"></i></div>
      <form @submit.prevent="next">
        <h1>{{ cur.t }}</h1>
        <p class="sub">{{ cur.sub }}</p>

        <input v-if="cur.k === 'name'" type="text" v-model="f.name" maxlength="30" placeholder="First name" aria-label="First name" autocomplete="given-name">

        <div v-else-if="cur.k === 'birth'" class="three">
          <select v-model="f.m" aria-label="Month"><option value="" disabled>Month</option><option v-for="(mm, i) in MONTHS" :key="i" :value="i">{{ mm }}</option></select>
          <select v-model="f.d" aria-label="Day"><option value="" disabled>Day</option><option v-for="n in 31" :key="n" :value="n">{{ n }}</option></select>
          <select v-model="f.y" aria-label="Year"><option value="" disabled>Year</option><option v-for="yy in YEARS" :key="yy" :value="yy">{{ yy }}</option></select>
        </div>

        <div v-else-if="cur.k === 'gender'" class="opts">
          <button type="button" v-for="g in GENDERS" :key="g" class="opt" :aria-pressed="f.gender === g" @click="f.gender = g">{{ g }}</button>
        </div>

        <template v-else-if="cur.k === 'into'">
          <div class="opts">
            <button type="button" v-for="g in GENDERS" :key="g" class="opt" :aria-pressed="f.interestedIn.includes(g)" @click="toggle(f.interestedIn, g)">{{ g }}</button>
          </div>
          <div class="three" style="margin-top:14px">
            <label class="field"><span>From age</span><input type="number" min="18" max="99" v-model.number="f.ageMin"></label>
            <label class="field"><span>To age</span><input type="number" min="18" max="99" v-model.number="f.ageMax"></label>
          </div>
        </template>

        <div v-else-if="cur.k === 'goal'" class="opts">
          <button type="button" v-for="g in GOALS" :key="g" class="opt" :aria-pressed="f.goal === g" @click="f.goal = g">{{ g }}</button>
        </div>

        <template v-else-if="cur.k === 'sports'">
          <div class="chips" role="group" aria-label="Sports">
            <button type="button" v-for="s in SPORTS" :key="s" class="chip light" :aria-pressed="f.sports.includes(s)" @click="toggle(f.sports, s, 8)">{{ s }}</button>
          </div>
          <p class="sub" style="margin-top:20px">Your level</p>
          <div class="chips"><button type="button" v-for="l in LEVELS" :key="l" class="chip light" :aria-pressed="f.level === l" @click="f.level = f.level === l ? '' : l">{{ l }}</button></div>
        </template>

        <template v-else-if="cur.k === 'routine'">
          <p class="sub">When you usually train</p>
          <div class="chips"><button type="button" v-for="r in ROUTINES" :key="r" class="chip light" :aria-pressed="f.routine === r" @click="f.routine = f.routine === r ? '' : r">{{ r }}</button></div>
          <p class="sub" style="margin-top:20px">How you work</p>
          <div class="chips"><button type="button" v-for="w in WORK" :key="w" class="chip light" :aria-pressed="f.workStyle === w" @click="f.workStyle = f.workStyle === w ? '' : w">{{ w }}</button></div>
        </template>

        <template v-else-if="cur.k === 'city'">
          <datalist id="cities"><option v-for="c in CITIES" :key="c" :value="c" /></datalist>
          <label class="field"><span>Home city</span><input type="text" v-model="f.homeCity" list="cities" maxlength="60" autocomplete="address-level2"></label>
          <label class="field"><span>Where you are now (optional)</span><input type="text" v-model="f.currentCity" list="cities" maxlength="60"></label>
        </template>

        <template v-else-if="cur.k === 'trip'">
          <datalist id="tcities"><option v-for="c in CITIES" :key="c" :value="c" /></datalist>
          <label class="field"><span>City you're heading to</span><input type="text" v-model="f.nextCity" list="tcities" maxlength="60" placeholder="e.g. Lisbon"></label>
          <label class="field"><span>Arriving on</span><input type="date" v-model="f.nextArrival" :min="utcToday()" :max="tripMaxDate()"></label>
          <p class="sub small">Members see only the city and date. You can remove it any time.</p>
        </template>

        <PhotoManager v-else-if="cur.k === 'photos'" v-model="f.photos" @busy="photoBusy=$event" class="light-box" />

        <template v-else>
          <textarea v-model="f.bio" maxlength="500" rows="5" placeholder="Training for my first ultra. Looking for someone to share long Sunday runs and longer brunches." aria-label="Bio"></textarea>
          <p class="sub small">{{ 500 - f.bio.length }} characters left</p>
        </template>

        <p v-if="err" class="obErr" role="alert">{{ err }}</p>
        <button class="go" :disabled="busy||photoBusy">{{ step === steps.length - 1 ? (busy ? "Saving…" : "Finish and start matching") : "Continue" }}</button>
        <p v-if="cur.k === 'trip'" style="text-align:center"><button type="button" class="lnk" @click="skipTrip">No trip planned, skip</button></p>
        <p v-if="['routine', 'trip', 'photos', 'bio'].includes(cur.k)" class="sub small" style="text-align:center">You can skip this and add it later.</p>
      </form>
    </div>
  </main>
</template>

<style scoped>
.ob{min-height:100vh;background:linear-gradient(160deg,#0B7A47,#0F2A22);color:#fff;padding:16px 0 40px}
.top{display:flex;justify-content:space-between}
.lnk{background:none;border:0;color:#fff;opacity:.9;cursor:pointer;font-weight:700;padding:8px 0}
.bar{height:5px;border-radius:5px;background:rgba(255,255,255,.25);margin:12px 0 8px}
.bar i{display:block;height:100%;border-radius:5px;background:#fff;transition:width .25s}
h1{font-size:32px;margin:28px 0 6px}
.sub{opacity:.85;margin:0 0 18px}
.three{display:flex;gap:10px}.three>*{flex:1}
.field span{color:#fff}
input,select,textarea{background:#fff!important;color:#0F2A22!important;border-color:transparent!important}
.opts{display:grid;gap:10px}
.opt{text-align:left;background:#fff;color:#0F2A22;border:2px solid transparent;border-radius:16px;padding:16px 18px;font-weight:700;cursor:pointer}
.opt[aria-pressed=true]{border-color:var(--coral);background:#E8F6EE}
.chip.light{background:#fff;color:#0F2A22;border-color:#fff}
.chip.light[aria-pressed=true]{background:var(--coral);border-color:var(--coral)}
.light-box :deep(.mute){color:#fff;opacity:.85}
.light-box :deep(.add label){color:#fff;border-color:rgba(255,255,255,.5)}
.obErr{color:#FFD3C4;font-weight:700}
.go{display:block;width:100%;margin-top:26px;background:#fff;color:#0B7A47;border:0;border-radius:999px;padding:15px;font-weight:800;font-size:17px;cursor:pointer}
.go:disabled{opacity:.6}
</style>

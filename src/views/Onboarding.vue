<script setup>
import { reactive, ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { api, photoUrl } from "../api.js";
import { session, logout } from "../auth.js";
import { GENDERS, GOALS, LEVELS, ROUTINES, WORK, SPORTS, CITIES, sameCity, utcToday, tripMaxDate } from "../options.js";
import PhotoManager from "../components/PhotoManager.vue";

const router = useRouter();
const formElement=ref(null);
const photoFailed=ref(false);
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(undefined, { month: "long" }));
const YEARS = Array.from({ length: 82 }, (_, i) => new Date().getFullYear() - 18 - i);

const f = reactive({
  name: session.user?.name || "", m: "", d: "", y: "", gender: "", interestedIn: [], ageMin: 18, ageMax: 45,
  goal: "", sports: [], level: "", routine: "", workStyle: "", homeCity: "", currentCity: "", nextCity: "", nextArrival: "", bio: "", photos: [],
});
const steps = [
  { k: "name", t: "First, your name.", sub: "This is how you appear to other members." },
  { k: "birth", t: "When is your birthday?", sub: "Members see your age, never your date of birth." },
  { k: "gender", t: "How do you identify?", sub: "" },
  { k: "into", t: "Who do you want to meet?", sub: "Pick one or more, and an age range." },
  { k: "goal", t: "What are you here for?", sub: "You can change this any time." },
  { k: "sports", t: "What moves you?", sub: "Pick up to 8. People who share them show up first." },
  { k: "routine", t: "How do you train?", sub: "Optional, but it helps find people whose schedule fits yours." },
  { k: "city", t: "Where are you based?", sub: "Home is where you live. Now is where you are this month, if different." },
  { k: "trip", t: "Planning a trip?", sub: "Say where you're heading next and when. People there can match with you before you land." },
  { k: "photos", t: "Put a face to your pace.", sub: "Choose photos that feel like you." },
  { k: "bio", t: "Say a little about yourself", sub: "Your next goal race, favourite trail, or ideal first date." },
];
const photoBusy=ref(false);
const step = ref(0), err = ref(""), busy = ref(false);
const cur = computed(() => steps[step.value]);
const previewPhoto=computed(()=>f.photos[0]?photoUrl(f.photos[0]):'');
const previewAge=computed(()=>{if(f.m===''||!f.d||!f.y)return '';const now=new Date();let age=now.getFullYear()-Number(f.y);if(now.getMonth()<Number(f.m)||(now.getMonth()===Number(f.m)&&now.getDate()<Number(f.d)))age--;return age>=18&&age<=99?age:'';});
watch(previewPhoto,()=>photoFailed.value=false);
function focusQuestion(element){element.querySelector('h1')?.focus({preventScroll:true});}
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
    router.replace("/app/discover");
  } catch (e) { err.value = e.message; }
  finally { busy.value = false; }
}
function skipTrip() { f.nextCity = ""; f.nextArrival = ""; err.value = ""; step.value++; }
async function signOut() { try { await logout(); router.replace("/"); } catch(e) { err.value=e.message; } }
</script>

<template>
  <main class="ob">
    <header class="ob-brand"><RouterLink to="/"><i aria-hidden="true"></i>Pacemate</RouterLink><button class="lnk" @click="signOut">Log out</button></header>
    <div class="ob-layout">
    <aside class="profile-story" aria-label="Your profile preview"><div class="preview-card"><img v-if="previewPhoto&&!photoFailed" :src="previewPhoto" alt="Your profile photo" @error="photoFailed=true"><div v-else class="preview-art" aria-hidden="true"><span class="spark">✦</span><span class="initial">{{ f.name.trim().slice(0,1).toUpperCase() || 'p' }}</span></div><div class="preview-content"><p v-if="f.goal" class="preview-goal">{{ f.goal }}</p><h2>{{ f.name.trim() || 'Your next chapter' }}<template v-if="previewAge">, {{ previewAge }}</template></h2><p v-if="f.currentCity||f.homeCity" class="preview-city">{{ f.currentCity || f.homeCity }}<template v-if="f.nextCity"> ·  {{ f.nextCity }}</template></p><div v-if="f.sports.length||f.routine" class="preview-tags"><span v-for="s in f.sports" :key="s">{{ s }}</span><span v-if="f.routine">{{ f.routine }}</span></div><p v-if="f.bio" class="preview-bio">{{ f.bio }}</p></div></div><p class="preview-caption">Your profile, coming to life.</p></aside>
    <div class="form-pane">
      <div class="top">
        <button v-if="step > 0" class="lnk" @click="step--; err = ''">← Back</button><span v-else></span>
        <span class="step-count">{{ String(step+1).padStart(2,'0') }} <span>/ {{ steps.length }}</span></span>
      </div>
      <div class="bar" role="progressbar" :aria-valuenow="step + 1" aria-valuemin="1" :aria-valuemax="steps.length"><i :style="{ width: ((step + 1) / steps.length) * 100 + '%' }"></i></div>
      <form ref="formElement" @submit.prevent="next">
        <Transition name="question" mode="out-in" @after-enter="focusQuestion"><div :key="cur.k" class="question-heading"><h1 tabindex="-1">{{ cur.t }}</h1><p v-if="cur.sub" class="sub">{{ cur.sub }}</p></div></Transition>

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
    </div></div>
  </main>
</template>

<style scoped>
.ob{min-height:100vh;background:#244f3b;color:#fff;padding:16px 0 40px}
.top{display:flex;justify-content:space-between}
.lnk{background:none;border:0;color:#fff;opacity:.9;cursor:pointer;font-weight:700;padding:8px 0}
.bar{height:5px;border-radius:12px;background:var(--card);margin:12px 0 8px}
.bar i{display:block;height:100%;border-radius:12px;background:var(--card);transition:none}
h1{font-size:32px;margin:28px 0 6px}
.sub{opacity:.85;margin:0 0 18px}
.three{display:flex;gap:10px}.three>*{flex:1}
.field span{color:#fff}
input,select,textarea{background:var(--card)!important;color:#0F2A22!important;border-color:transparent!important}
.opts{display:grid;gap:10px}
.opt{text-align:left;background:var(--card);color:#0F2A22;border:2px solid transparent;border-radius:12px;padding:16px 18px;font-weight:700;cursor:pointer}
.opt[aria-pressed=true]{border-color:var(--coral);background:#E8F6EE}
.chip.light{background:var(--card);color:#0F2A22;border-color:#fff}
.chip.light[aria-pressed=true]{background:var(--coral);border-color:var(--coral)}
.light-box :deep(.mute){color:#fff;opacity:.85}
.light-box :deep(.add label){color:#fff;border-color:rgba(255,255,255,.5)}
.obErr{color:#FFD3C4;font-weight:700}
.go{display:block;width:100%;margin-top:26px;background:var(--card);color:#0B7A47;border:0;border-radius:12px;padding:15px;font-weight:800;font-size:17px;cursor:pointer}
.go:disabled{opacity:.6}
</style>

<style scoped>
.ob{min-height:100svh;background:var(--bg);color:var(--ink);padding:0 0 50px}.ob-brand{max-width:1240px;display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 auto;padding:32px 40px}.ob-brand>a{display:flex;gap:10px;align-items:center;font:700 27px var(--display);letter-spacing:-1px;text-decoration:none}.ob-brand i{width:25px;height:25px;border-radius:12px;background:#244f3b;transform:none}.lnk{color:var(--mute);font-size:12px;font-weight:500;padding:8px 0}.ob-layout{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1fr);align-items:center;gap:90px;max-width:1060px;margin:35px auto 0;padding:0 40px}.profile-story{position:sticky;top:25px;align-self:start}.preview-card{position:relative;isolation:isolate;min-height:490px;border-radius:12px;overflow:hidden;background:#244f3b;color:#fff;display:flex;align-items:flex-end}.preview-card>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}.preview-card:after{content:'';position:absolute;inset:40% 0 0;background:rgba(16,44,35,.48);z-index:-1;pointer-events:none}.preview-art{position:absolute;inset:0;overflow:hidden;z-index:-2;background:rgba(16,44,35,.48)}.orbit{position:absolute;width:340px;height:340px;border:1px solid #ffffff1c;border-radius:12px;top:-35px;left:-30px}.orbit-two{top:28px;left:33px;width:210px;height:210px}.initial{position:absolute;top:60px;left:0;right:0;text-align:center;font:500 150px var(--display);color:#dce5bc;letter-spacing:-10px}.spark{position:absolute;right:35px;top:48px;font-size:33px;color:#efa17c}.preview-content{padding:28px;width:100%}.preview-content h2{font-size:34px;line-height:1.12;letter-spacing:-.04em;overflow-wrap:anywhere}.preview-goal{color:#dce5bc;font-size:10px;letter-spacing:.04em;margin:0 0 12px}.preview-city{font-size:13px;color:#e0e6db;margin:10px 0}.preview-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:18px}.preview-tags span{border:1px solid #ffffff30;background:#ffffff18;border-radius:12px;padding:5px 10px;font-size:10px}.preview-bio{font-size:12px;line-height:1.7;margin:18px 0 0;max-height:110px;overflow:auto;white-space:pre-wrap}.preview-caption{text-align:center;font-size:11px;color:var(--mute);margin-top:17px}.form-pane{min-width:0;align-self:center;padding:0 0 35px}.top{height:35px;align-items:center}.step-count{font-size:12px;font-weight:700}.step-count>span{font-weight:400;color:var(--mute);margin-left:5px}.bar{height:3px;background:var(--line);margin:12px 0 0}.bar i{background:var(--green)}h1{font-size:clamp(30px,3.2vw,40px);letter-spacing:-.04em;line-height:1.1;font-weight:600;margin:30px 0 12px}h1:focus{outline:none}.sub{font-size:13px;line-height:1.75;color:var(--mute);opacity:1}.question-heading{margin-bottom:26px}.field span{color:var(--ink);font-size:12px}input,select,textarea{border:1px solid var(--line)!important;background:var(--field)!important;color:var(--ink)!important;font-size:14px;min-height:51px}textarea{min-height:150px}.opt{background:var(--card);color:var(--ink);border:1px solid var(--line);padding:15px 18px;font-size:14px;font-weight:500;position:relative}.opt[aria-pressed=true]{background:var(--soft);border-color:var(--green)}.chip.light{background:var(--card);color:var(--ink);border:1px solid var(--line);font-size:12px;padding:9px 14px}.chip.light[aria-pressed=true]{background:#244f3b;color:#fff;border-color:#244f3b}.go{background:var(--green);color:var(--on);font-weight:600;min-height:52px;font-size:14px;margin-top:28px;transition:none}.go:hover:not(:disabled){}.obErr{color:var(--danger);font-size:13px}.three>*{min-width:0}.light-box :deep(.mute){color:var(--mute);opacity:1}.light-box :deep(.add label){color:var(--ink);border-color:var(--line)}.question-enter-active,.question-leave-active{transition:none}.question-enter-from{opacity:0;transform:translateY(5px)}.question-leave-to{opacity:0;transform:translateY(-5px)}
@media(max-width:800px){.ob-brand{padding:24px}.ob-layout{gap:35px;padding:0 24px;margin-top:20px}.preview-card{min-height:420px}.preview-content{padding:22px}.preview-content h2{font-size:28px}.initial{font-size:120px;top:65px}}
@media(max-width:600px){.ob{padding-bottom:30px}.ob-brand{padding:20px 24px}.ob-brand>a{font-size:24px}.ob-layout{display:flex;flex-direction:column;align-items:stretch;gap:24px;margin-top:10px;padding:0 24px}.profile-story{position:static}.preview-card{min-height:155px;border-radius:12px}.preview-art .initial{font-size:85px;left:auto;right:32px;top:24px;letter-spacing:-4px}.orbit-one{left:auto;right:-90px;top:-110px;width:280px;height:280px}.orbit-two{left:auto;right:-20px;top:-35px;width:140px;height:140px}.spark{font-size:20px;right:17px;top:17px}.preview-content{padding:21px;max-width:78%}.preview-content h2{font-size:24px}.preview-card>img{object-position:center 35%}.preview-card:has(>img):after{inset:0;background:rgba(16,44,35,.48)}.preview-tags{margin-top:11px;gap:5px}.preview-tags span{font-size:9px;padding:4px 7px}.preview-goal{font-size:9px;margin-bottom:7px}.preview-city{font-size:11px;margin:7px 0}.preview-bio,.preview-caption{display:none}.form-pane{padding-bottom:0}h1{font-size:30px;margin-top:22px}.question-heading{margin-bottom:22px}.top{height:25px}.bar{margin-top:10px}.three{gap:7px}.three select{font-size:12px;padding:12px 9px}.go{margin-top:24px}}
@media(prefers-reduced-motion:reduce){*{transition:none}}
</style>

<style scoped>
.ob{min-height:100svh;background:var(--bg);color:var(--ink);padding:0 0 50px}.ob-brand{max-width:1240px;display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 auto;padding:32px 40px}.ob-brand>a{display:flex;gap:10px;align-items:center;font:700 27px var(--display);letter-spacing:-1px;text-decoration:none}.ob-brand i{width:25px;height:25px;border-radius:50% 50% 50% 6px;background:linear-gradient(135deg,var(--green) 55%,#ee8b63 55%);transform:rotate(-20deg)}.lnk{color:var(--mute);font-size:12px;font-weight:500;padding:8px 0}.ob-layout{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1fr);align-items:center;gap:90px;max-width:1060px;margin:35px auto 0;padding:0 40px}.profile-story{position:sticky;top:25px;align-self:start}.preview-card{position:relative;isolation:isolate;min-height:490px;border-radius:28px;overflow:hidden;background:#244f3b;color:#fff;box-shadow:0 20px 50px #173a2814;display:flex;align-items:flex-end}.preview-card>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}.preview-card:after{content:'';position:absolute;inset:40% 0 0;background:linear-gradient(transparent,#10291ef0);z-index:-1;pointer-events:none}.preview-art{position:absolute;inset:0;overflow:hidden;z-index:-2;background:radial-gradient(ellipse at 20% 10%,#70976177,transparent 70%),#244f3b}.orbit{position:absolute;width:340px;height:340px;border:1px solid #ffffff1c;border-radius:50%;top:-35px;left:-30px}.orbit-two{top:28px;left:33px;width:210px;height:210px}.initial{position:absolute;top:60px;left:0;right:0;text-align:center;font:500 150px var(--display);color:#dce5bc;letter-spacing:-10px}.spark{position:absolute;right:35px;top:48px;font-size:33px;color:#efa17c}.preview-content{padding:28px;width:100%}.preview-content h2{font-size:34px;line-height:1.12;letter-spacing:-.04em;overflow-wrap:anywhere}.preview-goal{color:#dce5bc;font-size:10px;letter-spacing:.04em;margin:0 0 12px}.preview-city{font-size:13px;color:#e0e6db;margin:10px 0}.preview-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:18px}.preview-tags span{border:1px solid #ffffff30;background:#ffffff18;border-radius:999px;padding:5px 10px;font-size:10px}.preview-bio{font-size:12px;line-height:1.7;margin:18px 0 0;max-height:110px;overflow:auto;white-space:pre-wrap}.preview-caption{text-align:center;font-size:11px;color:var(--mute);margin-top:17px}.form-pane{min-width:0;align-self:center;padding:0 0 35px}.top{height:35px;align-items:center}.step-count{font-size:12px;font-weight:700}.step-count>span{font-weight:400;color:var(--mute);margin-left:5px}.bar{height:3px;background:var(--line);margin:12px 0 0}.bar i{background:var(--green)}h1{font-size:clamp(30px,3.2vw,40px);letter-spacing:-.04em;line-height:1.1;font-weight:600;margin:30px 0 12px}h1:focus{outline:none}.sub{font-size:13px;line-height:1.75;color:var(--mute);opacity:1}.question-heading{margin-bottom:26px}.field span{color:var(--ink);font-size:12px}input,select,textarea{border:1px solid var(--line)!important;background:var(--field)!important;color:var(--ink)!important;font-size:14px;min-height:51px}textarea{min-height:150px}.opt{background:var(--card);color:var(--ink);border:1px solid var(--line);padding:15px 18px;font-size:14px;font-weight:500;position:relative}.opt[aria-pressed=true]{background:var(--soft);border-color:var(--green)}.opt[aria-pressed=true]:after{content:'✓';position:absolute;right:17px;color:var(--green)}.chip.light{background:var(--card);color:var(--ink);border:1px solid var(--line);font-size:12px;padding:9px 14px}.chip.light[aria-pressed=true]{background:#244f3b;color:#fff;border-color:#244f3b}.go{background:var(--green);color:var(--on);font-weight:600;min-height:52px;font-size:14px;margin-top:28px;transition:transform .15s}.go:hover:not(:disabled){transform:translateY(-1px)}.obErr{color:var(--danger);font-size:13px}.three>*{min-width:0}.light-box :deep(.mute){color:var(--mute);opacity:1}.light-box :deep(.add label){color:var(--ink);border-color:var(--line)}.question-enter-active,.question-leave-active{transition:opacity .12s,transform .12s}.question-enter-from{opacity:0;transform:translateY(5px)}.question-leave-to{opacity:0;transform:translateY(-5px)}
@media(max-width:800px){.ob-brand{padding:24px}.ob-layout{gap:35px;padding:0 24px;margin-top:20px}.preview-card{min-height:420px}.preview-content{padding:22px}.preview-content h2{font-size:28px}.initial{font-size:120px;top:65px}}
@media(max-width:600px){.ob{padding-bottom:30px}.ob-brand{padding:20px 24px}.ob-brand>a{font-size:24px}.ob-layout{display:flex;flex-direction:column;align-items:stretch;gap:24px;margin-top:10px;padding:0 24px}.profile-story{position:static}.preview-card{min-height:155px;border-radius:20px}.preview-art .initial{font-size:85px;left:auto;right:32px;top:24px;letter-spacing:-4px}.orbit-one{left:auto;right:-90px;top:-110px;width:280px;height:280px}.orbit-two{left:auto;right:-20px;top:-35px;width:140px;height:140px}.spark{font-size:20px;right:17px;top:17px}.preview-content{padding:21px;max-width:78%}.preview-content h2{font-size:24px}.preview-card>img{object-position:center 35%}.preview-card:has(>img):after{inset:0;background:linear-gradient(90deg,#10291ee6,#10291e10)}.preview-tags{margin-top:11px;gap:5px}.preview-tags span{font-size:9px;padding:4px 7px}.preview-goal{font-size:9px;margin-bottom:7px}.preview-city{font-size:11px;margin:7px 0}.preview-bio,.preview-caption{display:none}.form-pane{padding-bottom:0}h1{font-size:30px;margin-top:22px}.question-heading{margin-bottom:22px}.top{height:25px}.bar{margin-top:10px}.three{gap:7px}.three select{font-size:12px;padding:12px 9px}.go{margin-top:24px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>

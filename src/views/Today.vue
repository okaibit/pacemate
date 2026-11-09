<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from "vue";
import { api } from "../api.js";
import { session } from "../auth.js";
import { LIFE_AREAS, MOODS, SPORTS } from "../options.js";
import { createSaveQueue } from "../save-queue.js";
import Modal from "../components/Modal.vue";
import Avatar from "../components/Avatar.vue";

// The member's own calendar day, so check-ins and streaks follow their timezone.
const localDay = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const day = ref(localDay());
const currentHour = ref(new Date().getHours());

const data = ref(null), loading = ref(true), err = ref("");
const ck = reactive({ areas: [], mood: null, sleepHours: "", note: "" });
const ckState = ref(""), answer = ref(""), ansState = ref("");
const w = reactive({ sport: session.profile.sports[0] || "Running", minutes: 30, distanceKm: "", note: "" });
const logging = ref(false), wErr = ref(""), showLog = ref(false);
const board = ref(null), boardScope = ref("all");

async function load() {
  try {
    const r = await api(`/api/today?day=${day.value}`);
    data.value = r;
    Object.assign(ck, { areas: [], mood: null, sleepHours: "", note: "" }, r.checkin || {});
    if (ck.sleepHours === null) ck.sleepHours = "";
    answer.value = r.answer;
    ckState.value="";
    err.value = "";
  } catch (e) { err.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);

const greeting = computed(() => currentHour.value < 12 ? "Good morning" : currentHour.value < 18 ? "Good afternoon" : "Good evening");
const dateLabel = computed(() => new Date(day.value+"T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }));
const score = computed(() => ck.areas.length);
const weekPct = computed(() => data.value ? Math.min(100, Math.round((data.value.week.activeDays / data.value.week.goal) * 100)) : 0);
const sportOptions = computed(() => [...new Set([...session.profile.sports, ...SPORTS])]);
const short = (d) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "narrow" });
const monthName = computed(() => new Date(day.value+"T12:00:00").toLocaleDateString(undefined, { month: "long" }));

let saveT, pendingSnapshot, clockTimer, rolling=false;
const userId=session.user.id;
const saver=createSaveQueue(async snapshot=>{
  if(session.user?.id!==userId)return;
  await api("/api/today/checkin",{method:"PUT",body:snapshot,expectedUserId:userId});
  if(snapshot.day===day.value){ckState.value="Saved";await refreshStats();}
});
function toggleArea(k) {
  const i=ck.areas.indexOf(k);i>-1?ck.areas.splice(i,1):ck.areas.push(k);saveCheckin();
}
function flushSave(){
  clearTimeout(saveT);
  if(!pendingSnapshot)return saver.drain();
  const snapshot=pendingSnapshot;pendingSnapshot=null;
  return saver.enqueue(snapshot).catch(error=>{ckState.value=error.message;});
}
function saveCheckin(delay=400){
  clearTimeout(saveT);ckState.value="Saving…";
  pendingSnapshot={areas:[...ck.areas],mood:ck.mood,sleepHours:ck.sleepHours,note:ck.note,day:day.value};
  saveT=setTimeout(flushSave,delay);
}
async function updateClock(){
  currentHour.value=new Date().getHours();
  const today=localDay();if(today===day.value||rolling)return;
  rolling=true;try{await flushSave();day.value=today;loading.value=true;await load();}finally{rolling=false;}
}
onMounted(()=>{clockTimer=setInterval(updateClock,30000);document.addEventListener("visibilitychange",updateClock);});
onBeforeUnmount(()=>{clearInterval(clockTimer);document.removeEventListener("visibilitychange",updateClock);flushSave();});
// Re-fetch numbers (streak, week, challenges) without overwriting what the member is typing.
async function refreshStats() {
  try {
    const r = await api(`/api/today?day=${day.value}`);
    Object.assign(data.value, { streak: r.streak, week: r.week, challenges: r.challenges, workouts: r.workouts });
  } catch {}
}
async function saveAnswer() {
  ansState.value = "Saving…";
  try { await api("/api/today/answer", { method: "PUT", body: { answer: answer.value, day: day.value } }); ansState.value = answer.value.trim() ? "Shared on your profile" : "Removed"; }
  catch (e) { ansState.value = e.message; }
}
async function logWorkout() {
  wErr.value = ""; logging.value = true;
  try {
    await api("/api/today/workouts", { method: "POST", body: { ...w, day: day.value } });
    // Workout activity is derived from the log; the manual Move check-in stays independent.
    Object.assign(w, { minutes: 30, distanceKm: "", note: "" }); showLog.value = false;
    await refreshStats();
  } catch (e) { wErr.value = e.message; }
  finally { logging.value = false; }
}
async function removeWorkout(x) {
  try { await api(`/api/today/workouts/${x.id}`, { method: "DELETE" }); await refreshStats(); } catch (e) { err.value = e.message; }
}
async function setGoal(n) {
  try { await api("/api/today/goal", { method: "PUT", body: { weeklyGoal: n } }); data.value.week.goal = n; session.profile.weeklyGoal = n; } catch (e) { err.value=e.message; }
}
async function toggleChallenge(c) {
  try { const r = await api(`/api/today/challenges/${c.id}`, { method: "POST", body: { day: day.value } }); c.joined = r.joined; } catch (e) { err.value = e.message; }
}
let boardRequest=0;
function closeBoard(){boardRequest++;board.value=null;}
async function openBoard(c, scope = boardScope.value) {
  const request=++boardRequest;
  boardScope.value = scope;
  board.value = { challenge: c, loading: true, leaders: [] };
  try { const result=await api(`/api/today/challenges/${c.id}/leaderboard?day=${day.value}&scope=${scope}`); if(request===boardRequest)board.value = { ...result, loading: false }; }
  catch (e) { if(request===boardRequest)board.value = { challenge: c, loading: false, leaders: [], error: e.message }; }
}
async function kudo(f) {
  try { const r = await api(`/api/today/kudos/${f.id}`, { method: "POST" }); f.gave = r.gave; f.kudos += r.gave ? 1 : -1; } catch (e) { err.value=e.message; }
}
const pct = (c) => Math.min(100, Math.round((c.value / c.target) * 100));
const fmtVal = (c) => (c.metric === "distance" ? `${Math.round(c.value * 10) / 10} km` : c.metric === "minutes" ? `${c.value} min` : `${c.value} days`);
const ago = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  return s < 3600 ? Math.max(1, Math.floor(s / 60)) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : Math.floor(s / 86400) + "d";
};
</script>

<template>
  <div class="today">
    <header class="day-heading"><p class="mute small" style="margin:0">{{ dateLabel }}</p><h1 class="h">{{ greeting }},<br>{{ session.profile.name }}<span class="greeting-dot">.</span></h1></header>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
    <div v-if="loading"  class="spinner"></div>

    <template v-else-if="data">
      <!-- Nudges -->
      <div class="nudges" v-if="data.badges.likesYou || data.badges.unread">
        <RouterLink v-if="data.badges.likesYou" to="/app/discover" class="nudge"> <b>{{ data.badges.likesYou }}</b> {{ data.badges.likesYou === 1 ? "person likes" : "people like" }} you. Explore Discover to connect.</RouterLink>
        <RouterLink v-if="data.badges.unread" to="/app/matches" class="nudge"> <b>{{ data.badges.unread }}</b> unread {{ data.badges.unread === 1 ? "message" : "messages" }}</RouterLink>
      </div>

      <!-- Streak and week -->
      <section class="stats">
        <div class="card streak">
          <span class="big">🔥 {{ data.streak.current }}</span>
          <span class="small">day streak</span>
          <span class="mute small">{{ data.streak.loggedToday ? "Done for today" : data.streak.current ? "Check in today to keep it" : "Check in to start one" }} · best {{ data.streak.best }}</span>
        </div>
        <div class="card week">
          <div class="row" style="justify-content:space-between">
            <b>This week</b>
            <span class="small mute">{{ data.week.activeDays }}/{{ data.week.goal }} active days</span>
          </div>
          <div class="days">
            <div v-for="d in data.week.days" :key="d.day" class="d" :class="{ on: d.active, now: d.day === day }" :title="d.day">
              <i></i><small>{{ short(d.day) }}</small>
            </div>
          </div>
          <div class="bar"><i :style="{ width: weekPct + '%' }"></i></div>
          <p class="small mute" style="margin:6px 0 0">{{ data.week.minutes }} min · {{ data.week.distance }} km · {{ data.kudosReceived }} kudos</p>
          <label class="small goal">Weekly goal
            <select :value="data.week.goal" @change="setGoal(+$event.target.value)" aria-label="Weekly goal">
              <option v-for="n in 7" :key="n" :value="n">{{ n }} {{ n === 1 ? "day" : "days" }}</option>
            </select>
          </label>
        </div>
      </section>

      <!-- Daily check-in -->
      <section class="card daily-card">
        <div class="row" style="justify-content:space-between">
          <h2>Daily check-in</h2>
          <span class="score" :class="{ full: score >= 5 }">{{ score }}/{{ LIFE_AREAS.length }}</span>
        </div>
        
        <div class="areas">
          <button v-for="a in LIFE_AREAS" :key="a.k" type="button" class="area" :aria-pressed="ck.areas.includes(a.k)" @click="toggleArea(a.k)">
            <span aria-hidden="true">{{ a.icon }}</span><b>{{ a.k }}</b><small v-if="ck.areas.includes(a.k)" class="area-done">✓</small>
          </button>
        </div>
        <p class="lbl">How do you feel?</p>
        <div class="moods" role="group" aria-label="Mood">
          <button v-for="(m, i) in MOODS" :key="i" type="button" class="mood" :aria-pressed="ck.mood === i + 1" :aria-label="'Mood ' + (i + 1) + ' of 5'" @click="ck.mood = ck.mood === i + 1 ? null : i + 1; saveCheckin()">{{ m }}</button>
        </div>
        <div class="row" style="margin-top:12px">
          <label class="field" style="width:130px;margin:0"><span>Sleep (hours)</span><input type="number" min="0" max="16" step="0.5" v-model="ck.sleepHours" @change="saveCheckin()"></label>
          <label class="field grow" style="margin:0"><span>Note to self</span><input type="text" v-model="ck.note" maxlength="280" placeholder="Grateful for…" @input="saveCheckin(1000)"></label>
        </div>
        <p class="small mute" role="status" style="margin:8px 0 0">{{ ckState || "Only you can see your check-ins." }}</p>
      </section>

      <!-- Workouts -->
      <section class="card training-card">
        <div class="row" style="justify-content:space-between">
          <h2>Training today</h2>
          <button class="btn sm" @click="showLog = !showLog">{{ showLog ? "Close" : "+ Log workout" }}</button>
        </div>
        <form v-if="showLog" class="stack" style="margin-top:12px" @submit.prevent="logWorkout">
          <div class="row">
            <label class="field grow" style="margin:0"><span>Sport</span><select v-model="w.sport"><option v-for="s in sportOptions" :key="s">{{ s }}</option></select></label>
            <label class="field" style="width:100px;margin:0"><span>Minutes</span><input type="number" min="1" max="600" v-model="w.minutes"></label>
            <label class="field" style="width:100px;margin:0"><span>Km (opt.)</span><input type="number" min="0" max="500" step="0.1" v-model="w.distanceKm"></label>
          </div>
          <label class="field" style="margin:0"><span>How did it go? (optional)</span><input type="text" v-model="w.note" maxlength="200" placeholder="Felt strong on the hills"></label>
          <p class="small mute" style="margin:0">Your matches see your workouts and can send kudos.</p>
          <p v-if="wErr" class="err">{{ wErr }}</p>
          <button class="btn" :disabled="logging">{{ logging ? "Saving…" : "Save workout" }}</button>
        </form>
        <ul v-if="data.workouts.length" class="wl">
          <li v-for="x in data.workouts" :key="x.id">
            <b>{{ x.sport }}</b> · {{ x.minutes }} min<template v-if="x.distanceKm"> · {{ x.distanceKm }} km</template>
            <span v-if="x.note" class="mute small"> ,  {{ x.note }}</span>
            <button class="link small" style="margin-left:auto" @click="removeWorkout(x)" :aria-label="'Remove ' + x.sport">Remove</button>
          </li>
        </ul>
        <p v-else-if="!showLog" class="mute small">A fresh start. Log your first workout today.</p>
      </section>

      <!-- Question of the day -->
      <section class="card q">
        <p class="eyebrow">Question of the day</p>
        <h2>{{ data.question }}</h2>
        <form class="row" style="margin-top:10px" @submit.prevent="saveAnswer">
          <input type="text" class="grow" v-model="answer" maxlength="200" placeholder="Your answer" aria-label="Your answer" style="flex:1">
          <button class="btn sm">Share</button>
        </form>
        <p class="small mute" style="margin:8px 0 0">{{ ansState || "Your answer shows on your profile for two weeks. It gives matches something to talk about." }}</p>
      </section>

      <!-- Challenges -->
      <section class="challenges">
        <div class="row" style="justify-content:space-between;margin:22px 0 10px">
          <h2>{{ monthName }} challenges</h2>
          <span class="mute small">Restart every month</span>
        </div>
        <div class="chs">
          <div v-for="c in data.challenges" :key="c.id" class="card ch" :class="{ joined: c.joined, done: c.value >= c.target }">
            <div class="row" style="gap:8px"><span class="ci" aria-hidden="true">{{ c.icon }}</span><b class="grow">{{ c.title }}</b></div>
            <p class="small mute" style="margin:6px 0">{{ c.desc }}</p>
            <div class="bar"><i :style="{ width: pct(c) + '%' }"></i></div>
            <p class="small" style="margin:6px 0 10px">{{ fmtVal(c) }} of {{ c.target }}{{ c.metric === "distance" ? " km" : c.metric === "minutes" ? " min" : "" }}<template v-if="c.value >= c.target"> ·  Complete!</template></p>
            <div class="row">
              <button class="btn sm" :class="{ ghost: c.joined }" @click="toggleChallenge(c)">{{ c.joined ? "Leave" : "Join" }}</button>
              <button class="link small" @click="openBoard(c)">Leaderboard</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Matches' activity -->
      <section class="card activity-card" style="margin-top:16px">
        <h2>Your matches this week</h2>
        <ul v-if="data.feed.length" class="feed">
          <li v-for="f in data.feed" :key="f.id">
            <Avatar :person="{ name: f.name, photos: f.photo ? [f.photo] : [] }" :size="40" />
            <div class="grow">
              <b>{{ f.name }}</b> logged {{ f.sport.toLowerCase() }} · {{ f.minutes }} min<template v-if="f.distanceKm"> · {{ f.distanceKm }} km</template>
              <div class="mute small">{{ f.note }}<template v-if="f.note"> · </template>{{ ago(f.createdAt) }} ago</div>
            </div>
            <button class="kudo" :aria-pressed="f.gave" @click="kudo(f)" :aria-label="'Give kudos to ' + f.name">👏 {{ f.kudos || "" }}</button>
          </li>
        </ul>
        <p v-else class="mute small">When your matches log workouts, they appear here and you can cheer them on. <RouterLink to="/app/discover">Find more people</RouterLink> or <RouterLink to="/app/events">join a session</RouterLink>.</p>
      </section>
    </template>

    <Modal v-if="board" :label="board.challenge.title" @close="closeBoard">
        <h2 id="lb" style="font-size:22px">{{ board.challenge.icon }} {{ board.challenge.title }}</h2>
        <div class="chips" style="margin:12px 0">
          <button class="chip" :aria-pressed="boardScope === 'all'" @click="openBoard(board.challenge, 'all')">Everyone</button>
          <button class="chip" :aria-pressed="boardScope === 'city'" @click="openBoard(board.challenge, 'city')">{{ session.profile.currentCity }}</button>
        </div>
        <div v-if="board.loading"  class="spinner"></div>
        <p v-else-if="board.error" class="err">{{ board.error }}</p>
        <p v-else-if="!board.leaders.length" class="mute">Nobody has joined yet. Be the first.</p>
        <ol v-else class="lb">
          <li v-for="(l, i) in board.leaders" :key="l.id" :class="{ me: l.me }">
            <span class="rank">{{ i + 1 }}</span><Avatar :person="l" :size="32" /><b class="grow">{{ l.me ? "You" : l.name }}</b>
            <span class="small">{{ board.challenge.metric === "distance" ? Math.round(l.value * 10) / 10 + " km" : board.challenge.metric === "minutes" ? l.value + " min" : l.value + " days" }}</span>
          </li>
        </ol>
        <p v-if="board.myRank > 20" class="small mute">You are #{{ board.myRank }} of {{ board.total }}.</p>
        <button class="btn block" style="margin-top:14px" @click="closeBoard">Close</button>
    </Modal>
  </div>
</template>

<style scoped>
.today{padding-bottom:128px}
.h{font-size:30px;margin:2px 0 14px}
h2{font-size:20px}
.today>section,.today>.nudges{margin-bottom:14px}
.nudges{display:grid;gap:8px}
.nudge{display:block;background:var(--soft);border:1px solid var(--green);border-radius:12px;padding:10px 14px;text-decoration:none}
.stats{display:grid;grid-template-columns:150px 1fr;gap:12px}
@media (max-width:480px){.stats{grid-template-columns:1fr}}
.streak{display:flex;flex-direction:column;justify-content:center;gap:2px;background:var(--soft);color:var(--ink);border:0}
.streak .mute{color:var(--mute);opacity:.8}
.big{font:800 34px var(--display)}
.days{display:flex;justify-content:space-between;margin:12px 0 8px}
.d{display:flex;flex-direction:column;align-items:center;gap:4px}
.d i{width:22px;height:22px;border-radius:12px;border:2px solid var(--line);display:block}
.d.on i{background:var(--green);border-color:var(--green)}
.d.now small{color:var(--ink);font-weight:800}
.d small{color:var(--mute);font-size:11px}
.bar{height:8px;border-radius:12px;background:var(--soft);overflow:hidden}
.bar i{display:block;height:100%;background:#244f3b;border-radius:12px;transition:none}
.goal{display:flex;align-items:center;gap:8px;margin-top:8px}.goal select{width:auto;padding:4px 8px}
.score{font:800 18px var(--display);background:var(--soft);border-radius:12px;padding:2px 12px}
.score.full{background:var(--coral);color:var(--on)}
.areas{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
@media (max-width:480px){.areas{grid-template-columns:repeat(2,1fr)}}
.area{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;border:2px solid var(--line);background:transparent;border-radius:12px;padding:10px;cursor:pointer}
.area span{font-size:22px}.area small{color:var(--mute);font-size:12px;line-height:1.3}
.area[aria-pressed=true]{border-color:var(--green);background:var(--soft)}
.lbl{font-weight:700;font-size:14px;margin:14px 0 6px}
.moods{display:flex;gap:8px}
.mood{font-size:26px;background:transparent;border:2px solid var(--line);border-radius:12px;padding:4px 10px;cursor:pointer;filter:grayscale(.6)}
.mood[aria-pressed=true]{border-color:var(--coral);filter:none;background:var(--soft)}
.wl,.feed,.lb{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}
.wl li{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line)}
.eyebrow{margin:0 0 4px;font-weight:700;font-size:13px;color:var(--coral);text-transform:uppercase;letter-spacing:.08em}
.q h2{font-size:22px}
.chs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:480px){.chs{grid-template-columns:1fr}}
.ch.joined{border-color:var(--green)}
.ch.done{background:var(--soft)}
.ci{font-size:22px}
.feed li{display:flex;gap:10px;align-items:center}
.kudo{border:2px solid var(--line);background:transparent;border-radius:12px;padding:6px 12px;cursor:pointer;font-weight:700}
.kudo[aria-pressed=true]{border-color:var(--coral);background:var(--soft)}
.lb li{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:12px}
.lb li.me{background:var(--soft)}
.rank{width:22px;font-weight:800;color:var(--mute)}
</style>

<style scoped>
.day-heading{padding:3px 0 12px}.day-heading>p{font-size:13px;letter-spacing:.025em}.h{font-size:clamp(34px,4vw,48px);font-weight:700;letter-spacing:-.045em;margin:10px 0 14px;line-height:1.06}.greeting-dot{color:var(--coral)}
.stats{grid-template-columns:1fr 1.7fr;gap:18px}.streak{position:relative;overflow:hidden;padding:26px!important;min-height:190px;background:var(--soft);border-radius:12px}.streak:after{content:'';position:absolute;border:1px solid #ffffff20;border-radius:12px;width:190px;height:190px;right:-90px;top:-65px;pointer-events:none}.streak .big{font-size:50px;letter-spacing:-2px}.streak>.small{font-size:15px}.streak>.mute{font-size:12px;margin-top:10px;max-width:180px}
.week{padding:24px!important}.days{margin:20px 0 12px}.d i{width:30px;height:30px;background:var(--bg);border:0}.d.now i{outline:2px solid var(--green);outline-offset:3px}.d.on i{background:var(--green)}.bar{height:6px}.bar i{background:var(--green)}.goal{font-size:12px}.goal select{font-size:12px;min-height:30px!important;padding:4px 28px 4px 9px!important}
.area{position:relative;min-height:90px;padding:15px 12px;background:var(--bg);border:1px solid transparent;border-radius:12px;gap:9px;transition:none}.area:hover{border-color:var(--line)}.area span{font-size:24px}.area b{font-size:13px}.area[aria-pressed=true]{background:var(--soft);border-color:var(--green)}.area-done{position:absolute;right:10px;top:8px;color:var(--green)}.mood{background:var(--bg);border:1px solid transparent;filter:none;min-width:48px;font-size:25px;padding:7px}.mood:hover{border-color:var(--line)}.score{font-size:14px;padding:6px 12px}.q{background:var(--soft);border-color:transparent!important}.q .eyebrow{font-size:10px;color:var(--green);letter-spacing:.13em}.q h2{font-size:26px;line-height:1.2;margin:12px 0}.training-card{position:relative;overflow:hidden}.training-card>p{margin-top:26px;max-width:230px}.chs{gap:18px}.ch{padding:22px!important}.ci{display:grid;place-items:center;background:var(--soft);height:40px;width:40px;border-radius:12px;margin-right:4px}
@media(min-width:1200px){.today{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:20px;align-items:start}.today>section,.today>.nudges{margin:0}.day-heading,.stats,.nudges,.challenges,.activity-card,.today>.err,.today>.spinner{grid-column:1/-1}.daily-card{grid-column:1;grid-row:span 2}.training-card{grid-column:2;min-height:180px}.q{grid-column:2}.challenges .chs{grid-template-columns:repeat(3,minmax(0,1fr))}.areas{gap:8px}.area{padding:13px 10px}.today .activity-card{margin-top:0!important}}
@media(max-width:480px){.stats{grid-template-columns:1fr 1.35fr;gap:10px}.streak{padding:18px!important;min-height:180px}.streak .big{font-size:38px}.week{padding:16px!important}.week .row{gap:2px}.week .row b{font-size:13px}.week .row span{font-size:11px}.d i{width:17px;height:17px}.areas{grid-template-columns:repeat(4,1fr)}.area{padding:10px 8px;min-height:82px}.area b{font-size:11px}.area span{font-size:21px}}

</style>


<style scoped>
.day-heading{padding:3px 0 12px}.day-heading>p{font-size:13px;letter-spacing:.025em}.h{font-size:clamp(34px,4vw,48px);font-weight:700;letter-spacing:-.045em;margin:10px 0 14px;line-height:1.06}.greeting-dot{color:var(--coral)}
.stats{grid-template-columns:1fr 1.7fr;gap:18px}.streak{position:relative;overflow:hidden;padding:26px!important;min-height:190px;background:var(--soft);border-radius:24px}.streak:after{content:'';position:absolute;border:1px solid #ffffff20;border-radius:50%;width:190px;height:190px;right:-90px;top:-65px;box-shadow:0 0 0 24px #ffffff08,0 0 0 48px #ffffff06;pointer-events:none}.streak .big{font-size:50px;letter-spacing:-2px}.streak>.small{font-size:15px}.streak>.mute{font-size:12px;margin-top:10px;max-width:180px}
.week{padding:24px!important}.days{margin:20px 0 12px}.d i{width:30px;height:30px;background:var(--bg);border:0}.d.now i{outline:2px solid var(--green);outline-offset:3px}.d.on i{background:var(--green)}.bar{height:6px}.bar i{background:var(--green)}.goal{font-size:12px}.goal select{font-size:12px;min-height:30px!important;padding:4px 28px 4px 9px!important}
.area{position:relative;min-height:90px;padding:15px 12px;background:var(--bg);border:1px solid transparent;border-radius:16px;gap:9px;transition:background .18s,transform .18s}.area:hover{transform:translateY(-2px);border-color:var(--line)}.area span{font-size:24px}.area b{font-size:13px}.area[aria-pressed=true]{background:var(--soft);border-color:var(--green)}.area-done{position:absolute;right:10px;top:8px;color:var(--green)}.mood{background:var(--bg);border:1px solid transparent;filter:none;min-width:48px;font-size:25px;padding:7px}.mood:hover{border-color:var(--line)}.score{font-size:14px;padding:6px 12px}.q{background:var(--soft);border-color:transparent!important}.q .eyebrow{font-size:10px;color:var(--green);letter-spacing:.13em}.q h2{font-size:26px;line-height:1.2;margin:12px 0}.training-card{position:relative;overflow:hidden}.training-card>p{margin-top:26px;max-width:230px}.chs{gap:18px}.ch{padding:22px!important}.ci{display:grid;place-items:center;background:var(--soft);height:40px;width:40px;border-radius:12px;margin-right:4px}
@media(min-width:1200px){.today{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:20px;align-items:start}.today>section,.today>.nudges{margin:0}.day-heading,.stats,.nudges,.challenges,.activity-card,.today>.err,.today>.spinner{grid-column:1/-1}.daily-card{grid-column:1;grid-row:span 2}.training-card{grid-column:2;min-height:180px}.q{grid-column:2}.challenges .chs{grid-template-columns:repeat(3,minmax(0,1fr))}.areas{gap:8px}.area{padding:13px 10px}.today .activity-card{margin-top:0!important}}
@media(max-width:480px){.stats{grid-template-columns:1fr 1.35fr;gap:10px}.streak{padding:18px!important;min-height:180px}.streak .big{font-size:38px}.week{padding:16px!important}.week .row{gap:2px}.week .row b{font-size:13px}.week .row span{font-size:11px}.d i{width:17px;height:17px}.areas{grid-template-columns:repeat(4,1fr)}.area{padding:10px 8px;min-height:82px}.area b{font-size:11px}.area span{font-size:21px}}

</style>

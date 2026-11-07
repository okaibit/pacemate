<script setup>
import { ref, computed, onMounted } from "vue";
import { api, formatEventTime } from "../api.js";
import { session } from "../auth.js";
import SiteFooter from "../components/SiteFooter.vue";
import { REGIONS, regionOf, LIFE_AREAS } from "../options.js";
import { FAQ } from "../seo.js";

const stats = ref(null);
const events = ref([]);
const cities = ref([]);
const city = ref("");
const region = ref("");
const appHome = computed(() => (session.profile ? "/app/today" : "/onboarding"));
const primaryTo = computed(() => (session.user ? appHome.value : "/signup"));

const people = [
  { img: "p1", name: "Julia", sport: "Running", routine: "Early riser", city: "Lisbon", shared: "Running" },
  { img: "p2", name: "Lucas", sport: "Surfing", routine: "Dawn patrol", city: "Bali" },
  { img: "p3", name: "Marina", sport: "Yoga", routine: "Morning flow", city: "Barcelona", shared: "Yoga" },
  { img: "p4", name: "Gabriel", sport: "Climbing", routine: "After work", city: "Medellín" },
  { img: "p5", name: "Clara", sport: "Cycling", routine: "Weekend warrior", city: "Berlin", shared: "Cycling" },
  { img: "p6", name: "Tomas", sport: "Padel", routine: "Lunchtime", city: "Mexico City" },
];

const sports = ["Running", "Cycling", "Climbing", "Surfing", "Yoga", "Padel", "CrossFit", "Swimming", "Hiking", "Tennis", "Triathlon", "Bouldering"];

const regions = computed(() => Object.keys(REGIONS).filter((r) => cities.value.some((c) => regionOf(c) === r)));
const regionCities = computed(() => cities.value.filter((c) => !region.value || regionOf(c) === region.value));
const shown = computed(() => events.value.filter((e) =>
  (!region.value || regionOf(e.city) === region.value) && (!city.value || e.city === city.value)).slice(0, 6));
function pickRegion(r) { region.value = r; city.value = ""; }
const fmt = (n) => Number(n || 0).toLocaleString();
const showCounts = computed(() => stats.value && stats.value.members >= 50);

onMounted(async () => {
  api("/api/stats").then((s) => (stats.value = s)).catch(() => {});
  try {
    const r = await api("/api/events");
    events.value = r.events; cities.value = r.cities;
  } catch {}
});
</script>

<template>
  <div class="land">
    <nav class="top">
      <div class="wrap wide bar">
        <RouterLink class="logo" to="/"><span class="mark" aria-hidden="true"></span>Pacemate</RouterLink>
        <div class="links">
          <a href="#profiles">Profiles</a>
          <a href="#events">Sessions</a>
          <a href="#daily">Daily</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
        </div>
        <div class="row">
          <template v-if="session.user"><RouterLink class="btn sm" :to="appHome">Open the app</RouterLink></template>
          <template v-else>
            <RouterLink class="btn ghost sm" to="/login">Log in</RouterLink>
            <RouterLink class="btn sm" to="/signup">Join free</RouterLink>
          </template>
        </div>
      </div>
    </nav>

    <header class="wrap wide hero">
      <div class="copy">
        <p class="kicker"><span class="pulse" aria-hidden="true"></span>Dating and community for athletes and active singles</p>
        <h1>Find someone who shares your <em>pace.</em></h1>
        <p class="lede">Pacemate matches you on the sports you love and the way you train, from early runs to weekend rides. Then it gets you together at a real session in your city.</p>
        <div class="row cta">
          <RouterLink class="btn coral lg" :to="primaryTo">{{ session.user ? 'Go to your matches' : 'Create your free profile' }}</RouterLink>
          <a class="btn ghost lg" href="#events">See upcoming sessions</a>
        </div>
        <ul class="trust">
          <li><b>Free</b> to join</li>
          <li><b>18+</b> only</li>
          <li v-if="cities.length"><b>{{ cities.length }}</b> cities</li>
          <li v-if="stats"><b>{{ fmt(stats.events) }}</b> sessions</li>
          <template v-if="showCounts">
            <li><b>{{ fmt(stats.members) }}</b> members</li>
            <li><b>{{ fmt(stats.matches) }}</b> matches</li>
          </template>
        </ul>
      </div>

      <div class="stage" aria-hidden="true">
        <img class="main" src="/images/hero.jpg" alt="" width="900" height="1612" fetchpriority="high">
        <div class="float profile">
          <img src="/images/p3.jpg" alt="">
          <div><b>Marina</b><small>Yoga · Running</small><span class="tag shared">2 shared sports</span></div>
        </div>
        <div class="float match">
          <div class="pair"><img src="/images/p1.jpg" alt=""><img src="/images/p4.jpg" alt=""></div>
          <div><b>It's a match</b><small>You both train before 7am</small></div>
        </div>
        <div class="float session">
          <span class="dot"></span><div><b>Sunrise run</b><small>Lisbon · Sat 07:30</small></div>
        </div>
      </div>
    </header>

    <div class="ticker" aria-hidden="true">
      <div class="track"><span v-for="(s, i) in [...sports, ...sports]" :key="i">{{ s }}</span></div>
    </div>

    <section id="profiles" class="wrap wide">
      <div class="head">
        <div>
          <p class="eyebrow">Profiles</p>
          <h2>Matched on how you move</h2>
        </div>
        <p class="lead">Profiles lead with what matters to active people. Shared sports rank first, and your training routine shows whether your schedules will actually line up.</p>
      </div>
      <div class="grid-people">
        <figure class="pcard" v-for="p in people" :key="p.img">
          <img :src="'/images/' + p.img + '.jpg'" alt="" loading="lazy" width="640" height="794">
          <span v-if="p.shared" class="badge">You both love {{ p.shared }}</span>
          <figcaption>
            <b>{{ p.name }}</b>
            <span class="meta">{{ p.city }}</span>
            <span class="pills"><i>{{ p.sport }}</i><i>{{ p.routine }}</i></span>
          </figcaption>
        </figure>
      </div>
      <p class="mute small note">Example profiles. Real members upload their own photos.</p>
    </section>

    <section class="wrap wide split">
      <div class="photo"><img src="/images/date.jpg" alt="Two people chatting over coffee after a workout" loading="lazy" width="1400" height="781"></div>
      <div>
        <p class="eyebrow">Why Pacemate</p>
        <h2>From first rep to first date.</h2>
        <ul class="features">
          <li><span class="ic">01</span><div><h3>Sport-first matching</h3><p>Pick up to 8 sports and your level. People who share them show up first, and you can filter by sport.</p></div></li>
          <li><span class="ic">02</span><div><h3>Routines that fit</h3><p>Early riser or after-work trainer? Matching on routine means plans that work for both of you.</p></div></li>
          <li><span class="ic">03</span><div><h3>Local or anywhere</h3><p>Browse your city, or match ahead of your next trip and meet when you land.</p></div></li>
          <li><span class="ic">04</span><div><h3>Safety built in</h3><p>Block or report from any profile or chat. Meet first at a group session if you prefer.</p></div></li>
        </ul>
      </div>
    </section>

    <section id="events" class="wrap wide">
      <div class="events-wrap">
        <div class="ev-photo">
          <img src="/images/event.jpg" alt="A group of runners celebrating after a trail run" loading="lazy" width="1400" height="781">
          <div class="ev-over">
            <p class="eyebrow light">Community</p>
            <h2>Upcoming sessions</h2>
            <p>Weekly runs, rides, hikes and surf meetups from Lagos to London, Nairobi to Tokyo. Join one after you sign up, or host your own.</p>
          </div>
        </div>
        <div class="ev-list">
          <div class="chips" v-if="regions.length" role="group" aria-label="Filter by region">
            <button class="chip" :aria-pressed="region === ''" @click="pickRegion('')">Worldwide</button>
            <button class="chip" v-for="r in regions" :key="r" :aria-pressed="region === r" @click="pickRegion(r)">{{ r }}</button>
          </div>
          <select v-if="regionCities.length" v-model="city" aria-label="Filter by city" class="city-pick">
            <option value="">All {{ regionCities.length }} cities{{ region ? " in " + region : "" }}</option>
            <option v-for="c in regionCities" :key="c" :value="c">{{ c }}</option>
          </select>
          <div class="events">
            <div class="ev" v-for="e in shown" :key="e.id">
              <time :datetime="e.startsAt"><b>{{ formatEventTime(e.startsAt, e.timezone).day }}</b><small>{{ formatEventTime(e.startsAt, e.timezone).time }}</small></time>
              <div class="ev-body"><h3>{{ e.title }}</h3><small class="mute">{{ e.city }} · {{ e.location }}</small></div>
              <span class="tag hot">{{ e.kind }}</span>
            </div>
            <p v-if="!shown.length" class="mute">No sessions listed yet. Sign up and host the first one.</p>
          </div>
          <RouterLink class="btn ghost sm more" :to="session.user ? '/app/events' : '/signup'">{{ session.user ? 'See all sessions' : 'Sign up to RSVP' }}</RouterLink>
        </div>
      </div>
    </section>

    <section id="daily" class="wrap wide daily">
      <div>
        <p class="eyebrow">Every day, not just date night</p>
        <h2>A daily habit for your whole life</h2>
        <p class="lead">Pacemate is where you track the things that make you feel good, with people who care about the same things. Open it every morning, even when you are not looking for a date.</p>
        <ul class="dl">
          <li><b>🔥 Streaks and weekly goals</b><span>Log workouts and check-ins, keep your streak alive, hit your active days.</span></li>
          <li><b>🏅 Monthly challenges</b><span>20 active days, the 100 km club, sleep well, calm mind. New every month, with city leaderboards.</span></li>
          <li><b>💬 Question of the day</b><span>A fresh prompt every morning. Your answer shows on your profile and starts conversations.</span></li>
          <li><b>👏 Kudos from your matches</b><span>See when matches train and cheer them on. Small moments that turn into dates.</span></li>
        </ul>
      </div>
      <div class="dcard" aria-hidden="true">
        <b>Daily check-in</b>
        <div class="dgrid"><span v-for="(a, i) in LIFE_AREAS" :key="a.k" :class="{ on: i % 3 !== 2 }">{{ a.icon }} {{ a.k }}</span></div>
        <div class="dstreak">🔥 12 day streak · 4/5 active days</div>
      </div>
    </section>

    <section id="how" class="wrap wide">
      <p class="eyebrow">How it works</p>
      <h2>Three steps to your first session together</h2>
      <ol class="steps">
        <li><h3>Build your profile</h3><p>Your sports, level, routine, city and what you are looking for. About two minutes.</p></li>
        <li><h3>Like who shares your pace</h3><p>When the like is mutual, it is a match and the chat opens.</p></li>
        <li><h3>Train together</h3><p>Plan a session in chat or meet at a community event.</p></li>
      </ol>
    </section>

    <section id="faq" class="wrap wide faq">
      <p class="eyebrow">FAQ</p>
      <h2>Questions, answered</h2>
      <div class="qa">
        <details v-for="(f, i) in FAQ" :key="f.q" :open="i === 0">
          <summary><h3>{{ f.q }}</h3></summary>
          <p>{{ f.a }}</p>
        </details>
      </div>
    </section>

    <section class="wrap wide">
      <div class="join">
        <div class="join-copy">
          <h2>Your next training partner might be your next date.</h2>
          <p>Free to join. 18+ only. Takes about two minutes.</p>
          <RouterLink class="btn coral lg" :to="primaryTo">{{ session.user ? 'Open the app' : 'Create your profile' }}</RouterLink>
        </div>
      </div>
    </section>
  </div>
  <SiteFooter />
</template>

<style scoped>
.wide{max-width:1200px}
.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent)}
.bar{display:flex;justify-content:space-between;align-items:center;padding-top:14px;padding-bottom:14px;gap:16px}
.logo{font:800 24px var(--display);text-decoration:none;display:inline-flex;align-items:center;gap:10px;letter-spacing:-.02em}
.mark{width:26px;height:26px;border-radius:9px;background:linear-gradient(135deg,var(--green) 0 55%,var(--coral) 55%);display:inline-block;transform:rotate(-8deg)}
.links{display:flex;gap:26px;font-weight:500}
.links a{text-decoration:none;color:var(--mute)}.links a:hover{color:var(--ink)}
.btn.lg{padding:15px 26px;font-size:17px}
.city-pick{margin:10px 0 4px;max-width:300px}
.daily{display:grid;grid-template-columns:1.2fr .8fr;gap:40px;align-items:center;padding-top:40px;padding-bottom:40px}
.dl{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:14px}
.dl li{display:flex;flex-direction:column}.dl span{color:var(--mute)}
.dcard{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:22px;box-shadow:0 20px 50px -20px rgba(11,122,71,.35)}
.dgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}
.dgrid span{border:2px solid var(--line);border-radius:12px;padding:8px 10px;font-weight:700;font-size:14px}
.dgrid span.on{border-color:var(--green);background:var(--soft)}
.dstreak{background:linear-gradient(160deg,#0B7A47,#0F2A22);color:#fff;border-radius:14px;padding:12px;font-weight:700;text-align:center}
@media (max-width:860px){.daily{grid-template-columns:1fr}}

/* Hero */
.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;padding-top:56px;padding-bottom:72px}
.kicker{display:inline-flex;align-items:center;gap:10px;font-weight:700;color:var(--green);margin:0 0 22px;font-size:14px;background:var(--soft);padding:7px 14px;border-radius:999px}
.pulse{width:8px;height:8px;border-radius:50%;background:var(--coral);box-shadow:0 0 0 0 var(--coral);animation:pulse 2s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 9px transparent}100%{box-shadow:0 0 0 0 transparent}}
.hero h1{font-size:clamp(44px,6.6vw,84px);font-weight:800;letter-spacing:-.035em;line-height:.98}
.hero h1 em{font-style:normal;color:var(--coral);position:relative;white-space:nowrap}
.lede{max-width:48ch;color:var(--mute);font-size:19px;margin:24px 0 30px}
.cta{gap:12px}
.trust{list-style:none;display:flex;flex-wrap:wrap;gap:10px 24px;padding:24px 0 0;margin:34px 0 0;border-top:1px solid var(--line);color:var(--mute);font-size:15px}
.trust b{color:var(--ink);font:800 20px var(--display);margin-right:4px}

.stage{position:relative;padding:28px 36px 40px 44px}
.stage .main{width:100%;aspect-ratio:4/5;object-fit:cover;object-position:center 40%;border-radius:32px;display:block;box-shadow:0 30px 60px -20px rgba(8,30,20,.35)}
.stage::before{content:"";position:absolute;inset:0 0 14px 18px;border-radius:40px;background:linear-gradient(160deg,var(--green),#0a5c37);transform:rotate(3deg);z-index:-1;opacity:.9}
.float{position:absolute;display:flex;align-items:center;gap:12px;background:var(--card);color:var(--ink);border-radius:18px;padding:10px 14px 10px 10px;box-shadow:0 18px 40px -12px rgba(8,30,20,.35);animation:bob 6s ease-in-out infinite}
.float b{display:block;font:800 16px var(--display)}.float small{display:block;color:var(--mute);font-size:13px}
.profile{top:56px;left:0}
.profile img{width:56px;height:56px;border-radius:14px;object-fit:cover}
.tag.shared{margin-top:5px;background:var(--soft);color:var(--green);font-size:12px;padding:2px 8px}
.match{bottom:10px;right:0;animation-delay:-2s;background:var(--ink);color:var(--bg)}
.match small{color:color-mix(in srgb,var(--bg) 75%,transparent)}
.pair{display:flex}.pair img{width:42px;height:42px;border-radius:50%;object-fit:cover;border:3px solid var(--ink)}.pair img+img{margin-left:-14px}
.session{bottom:150px;left:6px;animation-delay:-4s;padding:12px 16px}
.dot{width:12px;height:12px;border-radius:50%;background:var(--coral);flex:none}
@keyframes bob{50%{transform:translateY(-8px)}}

/* Ticker */
.ticker{overflow:hidden;background:var(--ink);color:var(--bg);padding:16px 0;transform:rotate(-1.2deg);margin:0 -10px}
.track{display:flex;gap:44px;width:max-content;animation:scroll 40s linear infinite;font:800 22px var(--display);white-space:nowrap}
.track span::after{content:"✦";margin-left:44px;color:var(--coral)}
@keyframes scroll{to{transform:translateX(-50%)}}

/* Sections */
section{padding-top:84px;padding-bottom:20px}
.eyebrow{font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.1em;font-size:13px;margin:0 0 10px}
.eyebrow.light{color:#9EF0C4}
h2{font-size:clamp(32px,4.6vw,52px);font-weight:800;letter-spacing:-.03em}
.head{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:end;margin-bottom:34px}
.lead{color:var(--mute);margin:0;font-size:17px}

.grid-people{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.pcard{margin:0;position:relative;border-radius:24px;overflow:hidden;background:var(--card);aspect-ratio:4/4.6}
.pcard img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s ease}
.pcard:hover img{transform:scale(1.04)}
.badge{position:absolute;top:14px;left:14px;background:var(--coral);color:#0F2A22;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px}
.pcard figcaption{position:absolute;inset:auto 0 0;padding:60px 18px 18px;color:#fff;background:linear-gradient(transparent,rgba(6,22,16,.88))}
.pcard b{font:800 26px var(--display);letter-spacing:-.02em}
.meta{margin-left:8px;opacity:.85;font-size:15px}
.pills{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.pills i{font-style:normal;font-size:13px;font-weight:700;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.18);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.25)}
.note{margin-top:14px}

.split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
.photo img{width:100%;aspect-ratio:5/6;object-fit:cover;border-radius:28px;display:block}
.features{list-style:none;padding:0;margin:28px 0 0;display:grid;gap:22px}
.features li{display:flex;gap:16px}
.ic{flex:none;width:44px;height:44px;border-radius:14px;background:var(--soft);color:var(--green);display:grid;place-items:center;font:800 15px var(--display)}
.features h3{font-size:20px;margin-bottom:4px}.features p{margin:0;color:var(--mute)}

.events-wrap{display:grid;grid-template-columns:.9fr 1.1fr;gap:28px;align-items:stretch}
.ev-photo{position:relative;border-radius:28px;overflow:hidden;min-height:420px}
.ev-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ev-over{position:absolute;inset:auto 0 0;padding:28px;color:#fff;background:linear-gradient(transparent,rgba(6,22,16,.9))}
.ev-over h2{color:#fff}.ev-over p:last-child{margin:10px 0 0;opacity:.9;max-width:40ch}
.ev-list{display:flex;flex-direction:column}
.events{display:grid;gap:10px;margin-top:16px}
.ev{display:grid;grid-template-columns:104px 1fr auto;gap:16px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;transition:border-color .2s,transform .2s}
.ev:hover{border-color:var(--green);transform:translateX(3px)}
.ev time{border-right:1px solid var(--line);padding-right:12px}
.ev time b{font:800 16px var(--display);display:block}.ev time small{color:var(--mute)}
.ev h3{font-size:18px}
.ev-body{min-width:0}.ev-body small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.more{align-self:flex-start;margin-top:16px}

.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:30px 0 0;padding:0;list-style:none;counter-reset:s}
.steps li{counter-increment:s;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px}
.steps li::before{content:counter(s,decimal-leading-zero);display:inline-grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--green);color:var(--on);font:800 16px var(--display);margin-bottom:16px}
.steps li:nth-child(2)::before{background:var(--coral);color:#0F2A22}
.steps li:nth-child(3)::before{background:var(--ink);color:var(--bg)}
.qa{display:grid;gap:12px;margin-top:28px;max-width:860px}
.qa details{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 22px}
.qa summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px}
.qa summary::-webkit-details-marker{display:none}
.qa summary::after{content:"+";font:800 24px var(--display);color:var(--green);flex:none}
.qa details[open] summary::after{content:"–"}
.qa h3{font-size:19px;margin:0}
.qa p{margin:12px 0 0;color:var(--mute);max-width:70ch}
.steps h3{font-size:22px;margin:0 0 6px}.steps p{margin:0;color:var(--mute)}

.join{position:relative;border-radius:32px;overflow:hidden;min-height:400px;display:flex;align-items:flex-end;background:#0F2A22 url(/images/hero.jpg) right 30% / cover no-repeat;margin-bottom:20px}
.join::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,26,19,.95) 0%,rgba(8,26,19,.75) 45%,rgba(8,26,19,.1) 100%)}
.join-copy{position:relative;padding:48px;color:#fff;max-width:620px}
.join h2{color:#fff}.join p{opacity:.85;margin:14px 0 24px;font-size:17px}

@media (max-width:960px){
  .links{display:none}
  .hero{grid-template-columns:1fr;gap:28px;padding-top:32px}
  .stage{max-width:520px;margin:0 auto;width:100%}
  .head,.split,.events-wrap{grid-template-columns:1fr;gap:24px}
  .grid-people{grid-template-columns:repeat(2,1fr)}
  .ev-photo{min-height:300px}
  .photo img{aspect-ratio:16/10}
}
@media (max-width:640px){
  .hero h1 em{white-space:normal}
  .stage{padding:20px 14px 34px 20px}
  .float{padding:8px 12px 8px 8px}.float b{font-size:14px}.float small{font-size:12px}
  .profile img{width:44px;height:44px}
  .session{bottom:120px}
  .grid-people{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 -20px;padding:0 20px 8px}
  .pcard{flex:0 0 74%;scroll-snap-align:start}
  .steps{grid-template-columns:1fr}
  .ev{grid-template-columns:1fr auto}.ev time{grid-column:1/-1;border:0;padding:0;display:flex;gap:8px;align-items:baseline}
  .join-copy{padding:28px}
  .join::before{background:linear-gradient(0deg,rgba(8,26,19,.95) 30%,rgba(8,26,19,.2) 100%)}
  section{padding-top:60px}
  .bar .btn.ghost{display:none}
}
</style>

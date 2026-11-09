<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import {session} from "../auth.js";
import { api } from "../api.js";
import Avatar from "../components/Avatar.vue";
import TripBadge from "../components/TripBadge.vue";

const list = ref([]), loading = ref(true), err = ref("");
const newMatches=computed(()=>list.value.filter(m=>!m.last));
const conversations=computed(()=>list.value.filter(m=>m.last));
let timer,disposed=false;
const refreshing=ref(false),viewer=session.user?.id;
async function load() {
  if(refreshing.value||disposed)return;
  refreshing.value=true;
  try {
    const result=await api("/api/matches",{expectedUserId:viewer});
    if(!disposed){list.value=result.matches;err.value="";}
  } catch(e) {
    if(!disposed){err.value=e.message;if(e.requestId)console.warn('Matches request failed',{code:e.code,requestId:e.requestId});}
  } finally {refreshing.value=false;if(!disposed)loading.value=false;}
}
function visible(){if(document.visibilityState==='visible')load();}
onMounted(()=>{load();timer=setInterval(visible,15000);document.addEventListener('visibilitychange',visible);});
onBeforeUnmount(()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);});
const when = (iso) => {
  const d = new Date(iso), diff = (Date.now() - d) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
</script>
<template>
  <div class="matches-page">
    <header class="matches-heading"><h1 class="h">Matches<span>.</span></h1><RouterLink v-if="list.length" to="/app/discover" class="btn ghost sm">Discover</RouterLink></header>
    <div v-if="err" class="match-error" role="alert"><p class="err">{{ err }}</p><button class="btn ghost sm" :disabled="refreshing" @click="load">{{ refreshing?'Retrying…':'Retry' }}</button></div>
    <p v-if="loading" role="status">Loading matches…</p>
    <section v-else-if="!list.length&&!err" class="match-empty">
      <svg class="connection-art" viewBox="0 0 360 210" fill="none" aria-hidden="true">
        <path d="M20 180V105a85 85 0 0 1 85-85h150a85 85 0 0 1 85 85v75" stroke="var(--line)" stroke-width="2"/>
        <path d="M60 180V105a45 45 0 0 1 45-45h150a45 45 0 0 1 45 45v75" stroke="var(--green)" stroke-width="2"/>
        <path d="M40 180V105a65 65 0 0 1 65-65h150a65 65 0 0 1 65 65v75" stroke="var(--mute)" stroke-width="2" stroke-dasharray="7 9"/>
        <circle class="pacer-pulse" cx="180" cy="40" r="12" fill="var(--coral)" opacity=".2"/>
        <circle cx="180" cy="40" r="5" fill="var(--coral)"/>
      </svg>
      <h2>No training partners on your track yet.</h2>
      <p class="match-empty-copy">Join an active session or drop your pace to get matched with runners nearby.</p>
      <RouterLink class="btn pacer-cta" to="/app/events">Find your pacer ⚡</RouterLink>
    </section>
    <template v-else-if="list.length">
    <section v-if="newMatches.length" class="new-matches"><h2>New connections<span>{{ newMatches.length }}</span></h2><div class="match-rail"><RouterLink v-for="m in newMatches" :key="m.id" :to="`/app/matches/${m.id}`" class="new-person"><span class="portrait-ring"><Avatar :person="m.other" :size="76"/></span><b>{{ m.other.name }}</b><span v-if="m.other.sports?.[0]" class="sport-name">{{ m.other.sports[0] }}</span></RouterLink></div></section>
    <h2 class="messages-title">Messages</h2>
    <p v-if="!conversations.length" class="mute quiet-empty">Say hello to your new connection.</p>
    <ul v-else class="list" aria-label="Conversations">
      <li v-for="m in conversations" :key="m.id">
        <RouterLink :to="`/app/matches/${m.id}`" class="item" :class="{unseen:m.unread}">
          <Avatar :person="m.other" :size="64" />
          <div class="grow txt">
            <div class="row" style="justify-content:space-between"><b>{{ m.other.name }} <span v-if="m.unread" class="unread" :aria-label="m.unread + ' unread'">{{ m.unread }}</span></b><span class="mute small">{{ when(m.last?.at || m.createdAt) }}</span></div>
            <div class="mute small preview">
              <template v-if="m.last">{{ m.last.mine ? "You: " : "" }}{{ m.last.body }}</template>
              <template v-else>New match · say hi and suggest a {{ m.other.sports[0]?.toLowerCase() || "session" }}</template>
            </div>
            <TripBadge :person="m.other" small style="margin-top:4px" />
          </div>
        </RouterLink>
      </li>
    </ul></template>
  </div>
</template>
<style scoped>
.h{font-size:30px;margin-bottom:14px}
.list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.item{display:flex;gap:12px;align-items:center;padding:12px;border-radius:12px;background:var(--card);border:1px solid var(--line);text-decoration:none}
.txt{min-width:0}
.unread{display:inline-block;min-width:20px;padding:0 6px;border-radius:12px;background:var(--coral);color:#0F2A22;font-size:12px;text-align:center;margin-left:4px}
.preview{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>

<style scoped>
.matches-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px;padding:14px 0}.matches-heading .h{font-size:clamp(32px,4vw,46px);letter-spacing:-.045em;margin:0}.matches-heading h1 span{color:var(--coral)}
.list{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;gap:0;overflow:hidden}.list li+li{border-top:1px solid var(--line)}.item{border:0;border-radius:12px;background:transparent;padding:22px 18px;gap:18px;transition:none}.item:hover{background:var(--soft)}.item .txt b{font-family:var(--display);font-size:20px;letter-spacing:-.025em}.preview{margin-top:5px}.unread{background:var(--green);color:var(--on-green)}
@media(max-width:480px){.matches-heading .h{font-size:34px}.item{padding:18px 8px;gap:13px}.list{padding:6px}.matches-heading{margin-bottom:16px}}
</style>

<style scoped>
.new-matches{padding:4px 0 28px}.new-matches h2,.messages-title{font:600 18px var(--display);letter-spacing:-.025em;margin:0 0 22px}.new-matches h2 span{display:inline-grid;place-items:center;min-width:23px;height:23px;border-radius:12px;background:var(--soft);color:var(--green);font:600 11px var(--body);margin-left:9px;vertical-align:middle}.match-rail{display:flex;gap:26px;overflow-x:auto;padding:5px 3px 12px}.new-person{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:84px;max-width:105px;text-decoration:none}.portrait-ring{padding:4px;border:2px solid var(--green);border-radius:12px;display:flex;transition:none}.new-person:hover .portrait-ring{}.new-person b{font-size:13px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sport-name{font-size:11px;color:var(--mute);margin-top:-6px}.messages-title{margin-bottom:16px}.list{padding:6px;background:var(--card);border-color:var(--line)}.item.unseen{background:var(--soft)}.item.unseen .preview{color:var(--ink);font-weight:600}.quiet-empty{padding:35px 0;border-top:1px solid var(--line);font-size:14px}.matches-heading{margin-bottom:22px}
</style>

<style scoped>
.matches-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px;padding:14px 0}.matches-heading .h{font-size:clamp(32px,4vw,46px);letter-spacing:-.045em;margin:0}.matches-heading h1 span{color:var(--coral)}
.list{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:12px;gap:0;overflow:hidden}.list li+li{border-top:1px solid var(--line)}.item{border:0;border-radius:16px;background:transparent;padding:22px 18px;gap:18px;transition:background .18s}.item:hover{background:var(--soft)}.item .txt b{font-family:var(--display);font-size:20px;letter-spacing:-.025em}.preview{margin-top:5px}.unread{background:var(--green);color:var(--on-green)}
@media(max-width:480px){.matches-heading .h{font-size:34px}.item{padding:18px 8px;gap:13px}.list{padding:6px}.matches-heading{margin-bottom:16px}}
</style>

<style scoped>
.new-matches{padding:4px 0 28px}.new-matches h2,.messages-title{font:600 18px var(--display);letter-spacing:-.025em;margin:0 0 22px}.new-matches h2 span{display:inline-grid;place-items:center;min-width:23px;height:23px;border-radius:50%;background:var(--soft);color:var(--green);font:600 11px var(--body);margin-left:9px;vertical-align:middle}.match-rail{display:flex;gap:26px;overflow-x:auto;padding:5px 3px 12px}.new-person{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:84px;max-width:105px;text-decoration:none}.portrait-ring{padding:4px;border:2px solid var(--green);border-radius:50%;display:flex;transition:transform .18s}.new-person:hover .portrait-ring{transform:translateY(-3px)}.new-person b{font-size:13px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sport-name{font-size:11px;color:var(--mute);margin-top:-6px}.messages-title{margin-bottom:16px}.list{padding:6px;background:var(--card);border-color:var(--line)}.item.unseen{background:var(--soft)}.item.unseen .preview{color:var(--ink);font-weight:600}.quiet-empty{padding:35px 0;border-top:1px solid var(--line);font-size:14px}.matches-heading{margin-bottom:22px}
</style>

<style scoped>.match-error{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:12px 0 20px}.match-error .err{font-size:13px;line-height:1.6;margin:0}.match-error button{flex:none}</style>

<style scoped>
.match-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:55vh;gap:30px;text-align:center}
.connection-art{width:100%;max-width:420px;height:auto}.match-empty h2{font:400 clamp(30px,6vw,42px)/1.15 var(--editorial)}.match-empty em{color:var(--coral)}
</style>

<style scoped>
.match-empty{gap:22px}.match-empty h2{max-width:440px;margin:0}.match-empty-copy{max-width:370px;margin:0;color:var(--mute);line-height:1.65}.pacer-cta{border-radius:var(--radius-pill)}.pacer-pulse{animation:pacer-pulse 2.4s ease-in-out infinite;transform-origin:180px 40px}
@keyframes pacer-pulse{50%{opacity:.08;transform:scale(1.5)}}
@media(prefers-reduced-motion:reduce){.pacer-pulse{animation:none}}
</style>

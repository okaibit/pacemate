<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { api } from "../api.js";
import Avatar from "../components/Avatar.vue";
import TripBadge from "../components/TripBadge.vue";

const list = ref([]), loading = ref(true), err = ref("");
const newMatches=computed(()=>list.value.filter(m=>!m.last));
const conversations=computed(()=>list.value.filter(m=>m.last));
let timer;
async function load() {
  try { list.value = (await api("/api/matches")).matches; err.value = ""; }
  catch (e) { err.value = e.message; }
  finally { loading.value = false; }
}
onMounted(() => { load(); timer = setInterval(() => document.visibilityState === "visible" && load(), 15000); });
onBeforeUnmount(() => clearInterval(timer));
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
    <header class="matches-heading"><h1 class="h">Matches<span>.</span></h1><RouterLink to="/app/discover" class="btn ghost sm">Discover </RouterLink></header>
    <p v-if="err" class="err">{{ err }}</p>
    <div v-if="loading"  class="spinner"></div>
    <div v-else-if="!list.length" class="card">
      <p style="margin-top:0"><b>No matches yet.</b></p>
      <p class="mute">Find someone who moves like you.</p>
      <RouterLink class="btn" to="/app/discover">Start discovering</RouterLink>
    </div>
    <template v-else>
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
.list{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;gap:0;overflow:hidden}.list li+li{border-top:1px solid var(--line)}.item{border:0;border-radius:12px;background:transparent;padding:22px 18px;gap:18px;transition:none}.item:hover{background:var(--soft)}.item .txt b{font-family:var(--display);font-size:20px;letter-spacing:-.025em}.preview{margin-top:5px}.unread{background:var(--green);color:var(--on)}
@media(max-width:480px){.matches-heading .h{font-size:34px}.item{padding:18px 8px;gap:13px}.list{padding:6px}.matches-heading{margin-bottom:16px}}
</style>

<style scoped>
.new-matches{padding:4px 0 28px}.new-matches h2,.messages-title{font:600 18px var(--display);letter-spacing:-.025em;margin:0 0 22px}.new-matches h2 span{display:inline-grid;place-items:center;min-width:23px;height:23px;border-radius:12px;background:var(--soft);color:var(--green);font:600 11px var(--body);margin-left:9px;vertical-align:middle}.match-rail{display:flex;gap:26px;overflow-x:auto;padding:5px 3px 12px}.new-person{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:84px;max-width:105px;text-decoration:none}.portrait-ring{padding:4px;border:2px solid var(--green);border-radius:12px;display:flex;transition:none}.new-person:hover .portrait-ring{}.new-person b{font-size:13px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sport-name{font-size:11px;color:var(--mute);margin-top:-6px}.messages-title{margin-bottom:16px}.list{padding:6px;background:var(--card);border-color:var(--line)}.item.unseen{background:var(--soft)}.item.unseen .preview{color:var(--ink);font-weight:600}.quiet-empty{padding:35px 0;border-top:1px solid var(--line);font-size:14px}.matches-heading{margin-bottom:22px}
</style>

<style scoped>
.matches-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px;padding:14px 0}.matches-heading .h{font-size:clamp(32px,4vw,46px);letter-spacing:-.045em;margin:0}.matches-heading h1 span{color:var(--coral)}
.list{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:12px;gap:0;overflow:hidden}.list li+li{border-top:1px solid var(--line)}.item{border:0;border-radius:16px;background:transparent;padding:22px 18px;gap:18px;transition:background .18s}.item:hover{background:var(--soft)}.item .txt b{font-family:var(--display);font-size:20px;letter-spacing:-.025em}.preview{margin-top:5px}.unread{background:var(--green);color:var(--on)}
@media(max-width:480px){.matches-heading .h{font-size:34px}.item{padding:18px 8px;gap:13px}.list{padding:6px}.matches-heading{margin-bottom:16px}}
</style>

<style scoped>
.new-matches{padding:4px 0 28px}.new-matches h2,.messages-title{font:600 18px var(--display);letter-spacing:-.025em;margin:0 0 22px}.new-matches h2 span{display:inline-grid;place-items:center;min-width:23px;height:23px;border-radius:50%;background:var(--soft);color:var(--green);font:600 11px var(--body);margin-left:9px;vertical-align:middle}.match-rail{display:flex;gap:26px;overflow-x:auto;padding:5px 3px 12px}.new-person{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:84px;max-width:105px;text-decoration:none}.portrait-ring{padding:4px;border:2px solid var(--green);border-radius:50%;display:flex;transition:transform .18s}.new-person:hover .portrait-ring{transform:translateY(-3px)}.new-person b{font-size:13px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sport-name{font-size:11px;color:var(--mute);margin-top:-6px}.messages-title{margin-bottom:16px}.list{padding:6px;background:var(--card);border-color:var(--line)}.item.unseen{background:var(--soft)}.item.unseen .preview{color:var(--ink);font-weight:600}.quiet-empty{padding:35px 0;border-top:1px solid var(--line);font-size:14px}.matches-heading{margin-bottom:22px}
</style>

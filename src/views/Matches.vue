<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { api } from "../api.js";
import Avatar from "../components/Avatar.vue";
import TripBadge from "../components/TripBadge.vue";

const list = ref([]), loading = ref(true), err = ref("");
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
  <div>
    <h1 class="h">Matches</h1>
    <p v-if="err" class="err">{{ err }}</p>
    <div v-if="loading" class="spinner"></div>
    <div v-else-if="!list.length" class="card">
      <p style="margin-top:0"><b>No matches yet.</b></p>
      <p class="mute">When someone you like likes you back, they show up here and you can start chatting.</p>
      <RouterLink class="btn" to="/app/discover">Start discovering</RouterLink>
    </div>
    <ul v-else class="list">
      <li v-for="m in list" :key="m.id">
        <RouterLink :to="`/app/matches/${m.id}`" class="item">
          <Avatar :person="m.other" :size="56" />
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
    </ul>
  </div>
</template>
<style scoped>
.h{font-size:30px;margin-bottom:14px}
.list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.item{display:flex;gap:12px;align-items:center;padding:12px;border-radius:16px;background:var(--card);border:1px solid var(--line);text-decoration:none}
.txt{min-width:0}
.unread{display:inline-block;min-width:20px;padding:0 6px;border-radius:10px;background:var(--coral);color:#0F2A22;font-size:12px;text-align:center;margin-left:4px}
.preview{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>

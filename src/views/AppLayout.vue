<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useRoute } from "vue-router";
import { session } from "../auth.js";
import { api } from "../api.js";
import ArrivalPrompt from "../components/ArrivalPrompt.vue";
import Avatar from "../components/Avatar.vue";

const route = useRoute();
const directChat = computed(() => route.meta.directChat);
const badges = ref({ unread: 0, likesYou: 0 });
const alerts = ref(0);
const tabs = [
  ["/app/today", "Today", "☀️", null],
  ["/app/discover", "Discover", "🔥", "likesYou"],
  ["/app/matches", "Matches", "💬", "unread"],
  ["/app/events", "Sessions", "📍", null],
  ["/app/profile", "Profile", "👤", null],
];
let timer;
async function refresh() {
  if (document.visibilityState !== "visible") return;
  try { badges.value = await api("/api/today/badges"); alerts.value = (await api("/api/notifications")).unread; } catch {}
}
onMounted(() => { refresh(); timer = setInterval(refresh, 30000); document.addEventListener("visibilitychange", refresh); });
onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); });
watch(() => route.path, refresh);
</script>
<template>
  <div class="shell">
    <header v-if="!directChat" class="hdr">
      <div class="narrow inner">
        <RouterLink to="/" class="logo">Pacemate</RouterLink>
        <div class="row"><RouterLink v-if="session.profile?.isAdmin" to="/app/admin" class="link small">Admin</RouterLink><RouterLink to="/app/notifications" class="alerts" :aria-label="`Notifications${alerts ? `, ${alerts} unread` : ''}`"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span v-if="alerts" class="alert-count">{{ alerts > 99 ? '99+' : alerts }}</span></RouterLink><RouterLink to="/app/profile" aria-label="Your profile"><Avatar :person="session.profile" :size="34" /></RouterLink></div>
      </div>
    </header>
    <main class="narrow body"><p v-if="session.profile?.suspended" class="err" role="alert">Your account is suspended. <a href="mailto:trypacemate@gmail.com">Contact support</a>.</p><ArrivalPrompt v-else-if="!directChat"/><RouterView :key="route.path" /></main>
    <nav v-if="!directChat" class="tabs" aria-label="App">
      <RouterLink v-for="[to, label, icon, badge] in tabs" :key="to" :to="to" class="tab">
        <span class="ic" aria-hidden="true">{{ icon }}</span>{{ label }}
        <span v-if="badge && badges[badge]" class="dot" :aria-label="badges[badge] + ' new'">{{ badges[badge] > 99 ? "99+" : badges[badge] }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
<style scoped>
.hdr{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--line)}
.inner{display:flex;justify-content:space-between;align-items:center;height:56px}
.logo{font:800 22px var(--display);text-decoration:none}
.body{padding-top:16px;padding-bottom:100px}
.tabs{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:center;background:var(--card);border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom,0);z-index:10}
.tab{position:relative;flex:1;max-width:120px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 2px 10px;text-decoration:none;color:var(--mute);font-weight:700;font-size:12px}
.ic{font-size:19px;line-height:1}
.tab.router-link-active{color:var(--green);box-shadow:inset 0 3px 0 var(--green)}
.dot{position:absolute;top:4px;left:calc(50% + 6px);min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--coral);color:#0F2A22;font-size:11px;line-height:18px;text-align:center}
.alerts{position:relative;font-size:24px;text-decoration:none;line-height:1}.alert-count{position:absolute;top:-6px;right:-12px;background:var(--coral);color:#0F2A22;border-radius:10px;font-size:10px;font-weight:800;padding:2px 5px}
</style>

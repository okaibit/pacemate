<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useRoute } from "vue-router";
import { session } from "../auth.js";
import { api } from "../api.js";
import PushPrompt from '../components/PushPrompt.vue';
import {noteMessage} from '../composables/usePush.js';
import ArrivalPrompt from "../components/ArrivalPrompt.vue";
import Avatar from "../components/Avatar.vue";

const route = useRoute();
const directChat = computed(() => route.meta.directChat);
const badges = ref({ unread: 0, likesYou: 0 });
const alerts = ref(0);
const tabs = computed(() => windowWidth.value < 1050 ? [
  ["/app/discover", "Discover", null],
  ["/app/today", "Today", null],
  ["/app/matches", "Matches", "unread"],
  ["/app/events", "Events", null],
  ["/app/profile", "Profile", null],
] : [
  ["/app/discover", "Discover", null],
  ["/app/matches", "Matches", "unread"],
  ["/app/events", "Sessions", null],
  ["/app/today", "Today", null],
  ["/app/profile", "Profile", null],
]);
const windowWidth = ref(typeof window === "undefined" ? 1050 : window.innerWidth);
function resize(){windowWidth.value=window.innerWidth;}
onMounted(()=>window.addEventListener("resize",resize));
onBeforeUnmount(()=>window.removeEventListener("resize",resize));
let timer;
async function refresh() {
  if (document.visibilityState !== "visible") return;
  try { badges.value = await api("/api/today/badges"); if(badges.value.unread)noteMessage(); alerts.value = (await api("/api/notifications")).unread;if(alerts.value)noteMessage(); } catch {}
}
onMounted(() => { refresh(); timer = setInterval(refresh, 30000); document.addEventListener("visibilitychange", refresh); });
onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); });
watch(() => route.path, refresh);
</script>
<template>
  <div class="shell" :class="{'in-chat':directChat}"><PushPrompt/>
    <header v-if="!directChat" class="hdr">
      <div class="narrow inner">
        <RouterLink to="/app/discover" class="logo">Pacemate</RouterLink>
        <div class="row"><RouterLink v-if="session.profile?.isAdmin" to="/app/admin" class="link small">Admin</RouterLink><RouterLink to="/app/notifications" class="alerts" :aria-label="`Notifications${alerts ? `, ${alerts} unread` : ''}`"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span v-if="alerts" class="alert-count">{{ alerts > 99 ? '99+' : alerts }}</span></RouterLink><RouterLink to="/app/profile" aria-label="Your profile"><Avatar :person="session.profile" :size="34" /></RouterLink></div>
      </div>
    </header>
    <main class="narrow body"><p v-if="session.profile?.suspended" class="err" role="alert">Your account is suspended. <a href="mailto:trypacemate@gmail.com">Contact support</a>.</p><ArrivalPrompt v-else-if="!directChat"/><RouterView :key="route.path" /></main>
    <nav v-if="!directChat" class="tabs" aria-label="App">
      <RouterLink v-for="[to, label, badge] in tabs" :key="to" :to="to" class="tab">
<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <template v-if="label==='Today'"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></template>
          <template v-else-if="label==='Discover'"><circle cx="12" cy="12" r="9"/><path d="m16.5 7.5-3 6-6 3 3-6Z"/></template>
          <template v-else-if="label==='Matches'"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2A8.5 8.5 0 0 1 21 11.5Z"/><path d="M7 11h10m-10 4h6"/></template>
          <template v-else-if="label==='Sessions'||label==='Events'"><rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/></template>
          <template v-else><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></template>
        </svg><span>{{ label }}</span>
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
.tab.router-link-active{color:var(--green);}
.dot{position:absolute;top:4px;left:calc(50% + 6px);min-width:18px;height:18px;padding:0 5px;border-radius:12px;background:var(--coral);color:#0F2A22;font-size:11px;line-height:18px;text-align:center}
.alerts{position:relative;font-size:24px;text-decoration:none;line-height:1}.alert-count{position:absolute;top:-6px;right:-12px;background:var(--coral);color:#0F2A22;border-radius:12px;font-size:10px;font-weight:800;padding:2px 5px}
</style>

<style scoped>
.shell{min-height:100vh;background:var(--bg);background-image:none}
.hdr{background:color-mix(in srgb,var(--bg) 92%,transparent);border-bottom:0}
.inner{height:80px}.logo{font-size:28px;letter-spacing:-1.2px;display:flex;align-items:center;gap:10px}.logo:before{content:'';display:block;width:27px;height:27px;background:var(--green);border-radius:12px;transform:none}
.body{padding-top:22px}.ic{width:23px;height:23px}.tab{transition:none}.tab.router-link-active{background:var(--soft);border-radius:12px;color:var(--green)}
.alerts{padding:9px;border:1px solid var(--line);border-radius:12px;display:flex}.hdr .row{gap:20px}
@media(min-width:1050px){
 .inner{max-width:1400px;padding:0 38px;height:100px}.body{max-width:1040px;width:calc(100% - 310px);margin-left:max(270px,calc((100% - 1400px)/2 + 270px));margin-right:32px;padding:24px 32px 70px}
 .tabs{inset:132px auto auto max(28px,calc((100% - 1400px)/2 + 28px));width:205px;flex-direction:column;background:transparent;border:0;padding:0;gap:9px}
 .tab{flex-direction:row;max-width:none;flex:initial;gap:15px;padding:17px 22px;font-size:15px;justify-content:flex-start;border-radius:12px}.tab:hover{background:var(--soft)}.tab.router-link-active{background:var(--ink);color:var(--bg);}.dot{top:12px;left:auto;right:12px}
 .in-chat{background:var(--bg)}.in-chat .body{max-width:760px;margin:0 auto;padding:0 20px;width:100%}
}
@media(max-width:1049px){.body,.inner{max-width:760px}.tabs{padding:8px 12px calc(8px + env(safe-area-inset-bottom,0));gap:4px}.tab{padding:10px 4px;gap:6px}.inner{height:70px}}
</style>

<style scoped>
.shell{min-height:100vh;background:var(--bg);background-image:radial-gradient(ellipse at 95% 0%,#dfebcf66,transparent 45%)}
.hdr{background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(18px);border-bottom:0}
.inner{height:80px}.logo{font-size:28px;letter-spacing:-1.2px;display:flex;align-items:center;gap:10px}.logo:before{content:'';display:block;width:27px;height:27px;background:var(--green);border-radius:50% 50% 50% 8px;transform:rotate(-35deg)}
.body{padding-top:22px}.ic{width:23px;height:23px}.tab{transition:background .18s,color .18s}.tab.router-link-active{box-shadow:none;background:var(--soft);border-radius:16px;color:var(--green)}
.alerts{padding:9px;border:1px solid var(--line);border-radius:50%;display:flex}.hdr .row{gap:20px}
@media(min-width:1050px){
 .inner{max-width:1400px;padding:0 38px;height:100px}.body{max-width:1040px;width:calc(100% - 310px);margin-left:max(270px,calc((100% - 1400px)/2 + 270px));margin-right:32px;padding:24px 32px 70px}
 .tabs{inset:132px auto auto max(28px,calc((100% - 1400px)/2 + 28px));width:205px;flex-direction:column;background:transparent;border:0;padding:0;gap:9px}
 .tab{flex-direction:row;max-width:none;flex:initial;gap:15px;padding:17px 22px;font-size:15px;justify-content:flex-start;border-radius:16px}.tab:hover{background:var(--soft)}.tab.router-link-active{background:var(--ink);color:var(--bg);box-shadow:0 7px 20px #19362a10}.dot{top:12px;left:auto;right:12px}
 .in-chat{background:var(--bg)}.in-chat .body{max-width:760px;margin:0 auto;padding:0 20px;width:100%}
}
@media(max-width:1049px){.body,.inner{max-width:760px}.tabs{padding:8px 12px calc(8px + env(safe-area-inset-bottom,0));gap:4px}.tab{padding:10px 4px;gap:6px}.inner{height:70px}}
</style>

<style scoped>.shell{background-image:none}.body{min-width:0}@media(max-width:700px){.inner{padding-left:16px;padding-right:16px}.hdr .row{gap:14px}.logo{font-size:25px}.body{padding-bottom:calc(110px + env(safe-area-inset-bottom,0px))}.tab{min-height:57px;min-width:0}.tab>span:not(.dot){font-size:11px}}</style>

<style scoped>
@media(max-width:1049px){
 .tabs{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));border:1px solid var(--line);border-radius:var(--radius-pill);padding:6px;gap:2px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(10px);box-shadow:var(--shadow-float);max-width:600px;margin:0 auto}
 .tab{max-width:none;min-width:0;min-height:58px;padding:8px 0;gap:3px;transition:none}
 .tab.router-link-active{border-radius:var(--radius-pill);background:var(--soft);box-shadow:none}
 .tab>span:not(.dot){font-size:11px}
 .body{padding-bottom:calc(116px + env(safe-area-inset-bottom,0px))}
}
</style>

<style scoped>
@media(max-width:1049px){.tab.router-link-active{background:transparent;color:var(--ink)}.tab.router-link-active::after{content:'';position:absolute;bottom:2px;left:calc(50% - 2px);width:4px;height:4px;border-radius:50%;background:currentColor}}
</style>

<style scoped>
.alerts{box-sizing:border-box;width:44px;height:44px;padding:10px;align-items:center;justify-content:center;flex:none}.alerts svg{flex:none;width:22px;height:22px}.alert-count{box-sizing:border-box;top:1px;right:1px;min-width:16px;height:16px;line-height:16px;padding:0 4px;font-size:9px;text-align:center;border-radius:999px}
</style>

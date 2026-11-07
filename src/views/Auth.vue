<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { login, signup, requestPasswordRecovery, oauthLogin, getSettings } from "../supabase.js";
import { session, loadProfile } from "../auth.js";

const props = defineProps({ mode: String });
const router = useRouter();
const route = useRoute();
const email = ref(""), password = ref(""), adult = ref(false);
const busy = ref(false), err = ref(""), done = ref("");
const providers = ref({});
const titles = { login: "Welcome back", signup: "Create your account", forgot: "Reset your password" };
watch(()=>props.mode,()=>{err.value="";done.value="";password.value="";});
const oauth = computed(() => Object.entries(providers.value).filter(([k, on]) => on && ["google", "github"].includes(k)).map(([k]) => k));

async function retryProfile() {
  busy.value = true; err.value = "";
  try { await loadProfile(); router.replace(session.profile ? "/app/today" : "/onboarding"); }
  catch (e) { err.value = e.message; }
  finally { busy.value = false; }
}

onMounted(async () => { try { providers.value = (await getSettings()).providers || {}; } catch {} });

function explain(e) {
  if (/email.*confirm|confirm.*email/i.test(e.message)) return "Confirm your email first. Check your inbox.";
  if (e.status === 429) return "Too many attempts. Wait a minute and try again.";
  return e.message || "Something went wrong. Please try again.";
}
async function startOAuth(provider) {
  err.value = "";
  if (props.mode === "signup" && !adult.value) { err.value = "Accept the terms and confirm you are 18 or older."; return; }
  try { await oauthLogin(provider); } catch (e) { err.value = explain(e); }
}

async function finish(user) {
  session.user = user;
  await loadProfile();
  const next = typeof route.query.next === "string" && route.query.next.startsWith("/") ? route.query.next : "/app/today";
  router.replace(session.profile ? next : "/onboarding");
}

async function submit() {
  err.value = ""; done.value = "";
  if (!/^\S+@\S+\.\S+$/.test(email.value)) { err.value = "Enter a valid email address."; return; }
  if (props.mode !== "forgot" && password.value.length < 8) { err.value = "Use a password of at least 8 characters."; return; }
  if (props.mode === "signup" && !adult.value) { err.value = "You must be 18 or older and accept the terms to join."; return; }
  busy.value = true;
  try {
    if (props.mode === "login") await finish(await login(email.value.trim(), password.value));
    else if (props.mode === "signup") {
      const user = await signup(email.value.trim(), password.value);
      if (user.emailVerified) await finish(user);
      else done.value = `We sent a confirmation link to ${email.value.trim()}. Open it on this device to finish creating your account.`;
    } else {
      await requestPasswordRecovery(email.value.trim());
      done.value = "If an account exists for that email, a reset link is on its way.";
    }
  } catch (e) { err.value = explain(e); }
  finally { busy.value = false; }
}
</script>

<template>
  <main class="auth">
    <RouterLink class="logo" to="/">Pacemate</RouterLink>
    <div class="card">
      <h1>{{ titles[mode] }}</h1>
      <p v-if="session.notice" class="ok">{{ session.notice }}</p>
      <div v-if="session.user && session.profileError">
        <p class="err" role="alert">{{ session.profileError }}</p>
        <button class="btn block" :disabled="busy" @click="retryProfile">Retry</button>
      </div>
      <p v-if="done" class="ok" role="status">{{ done }}</p>
      <form v-else @submit.prevent="submit" novalidate>
        <label class="field"><span>Email</span><input v-model="email" type="email" autocomplete="email" required></label>
        <label class="field" v-if="mode !== 'forgot'"><span>Password</span>
          <input v-model="password" type="password" :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'" minlength="8" required>
        </label>
        <label v-if="mode === 'signup'" class="check">
          <input type="checkbox" v-model="adult">
          <span>I am 18 or older and accept the <RouterLink to="/terms" target="_blank">terms</RouterLink> and <RouterLink to="/privacy" target="_blank">privacy policy</RouterLink>.</span>
        </label>
        <p v-if="err" class="err" role="alert">{{ err }}</p>
        <button class="btn block" :disabled="busy">{{ busy ? "Please wait…" : mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link" }}</button>
      </form>
      <div v-if="oauth.length && mode !== 'forgot' && !done" class="oauth">
        <p class="mute small">or</p>
        <button v-for="p in oauth" :key="p" class="btn ghost block" @click="startOAuth(p)">Continue with {{ p === "google" ? "Google" : "GitHub" }}</button>
      </div>
      <p class="small alt">
        <template v-if="mode === 'login'"><RouterLink to="/forgot">Forgot password?</RouterLink> · New here? <RouterLink to="/signup">Create an account</RouterLink></template>
        <template v-else-if="mode === 'signup'">Already a member? <RouterLink to="/login">Log in</RouterLink></template>
        <template v-else><RouterLink to="/login">Back to log in</RouterLink></template>
      </p>
    </div>
  </main>
</template>

<style scoped>
.auth{max-width:420px;margin:0 auto;padding:40px 16px}
.logo{display:block;font:800 26px var(--display);text-decoration:none;margin-bottom:22px;text-align:center}
h1{font-size:30px;margin-bottom:18px}
.check{display:flex;gap:10px;align-items:flex-start;margin:4px 0 16px;font-size:14px}
.check input{width:20px;height:20px;margin-top:2px;flex:none}
.oauth{text-align:center;margin-top:12px}.oauth .btn{margin-top:8px}
.alt{margin:18px 0 0;text-align:center}
</style>

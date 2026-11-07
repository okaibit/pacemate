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
const titles = { login: "Back to your people.", signup: "Your story starts here.", forgot: "Reset your password" };
watch(()=>props.mode,()=>{err.value="";done.value="";password.value="";});
const oauth = computed(() => Object.entries(providers.value).filter(([k, on]) => on && ["google", "github"].includes(k)).map(([k]) => k));

async function retryProfile() {
  busy.value = true; err.value = "";
  try { await loadProfile(); router.replace(session.profile ? "/app/discover" : "/onboarding"); }
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
  const next = typeof route.query.next === "string" && route.query.next.startsWith("/") ? route.query.next : "/app/discover";
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
  <main class="auth-flow">
    <aside class="auth-story"><img class="story-photo" src="/images/hero.jpg" alt="Two people running together by the sea"><RouterLink class="story-brand" to="/"><i aria-hidden="true"></i>Pacemate</RouterLink><div class="story-copy"><h2>A shared pace.<br>A new <em>beginning.</em></h2><div class="story-sports"><span>Running</span><span>Cycling</span><span>Yoga</span><span>And your kind of active.</span></div></div></aside>
    <section class="auth"><RouterLink class="mobile-brand" to="/">Pacemate</RouterLink><div class="card">
      <h1>{{ done ? (mode === 'signup' ? 'Check your inbox.' : 'On its way.') : titles[mode] }}</h1>
      <p v-if="session.notice" class="ok">{{ session.notice }}</p>
      <div v-if="session.user && session.profileError">
        <p class="err" role="alert">{{ session.profileError }}</p>
        <button class="btn block" :disabled="busy" @click="retryProfile">Retry</button>
      </div>
      <p v-if="done" class="ok" role="status">{{ done }}</p>
      <form v-else @submit.prevent="submit" novalidate>
        <label class="field"><span>Email</span><input v-model="email" type="email" placeholder="you@example.com" autocomplete="email" required></label>
        <label class="field" v-if="mode !== 'forgot'"><span>Password</span>
          <input v-model="password" type="password" :placeholder="mode === 'signup' ? 'At least 8 characters' : 'Your password'" :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'" minlength="8" required>
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
    </div><RouterLink class="back-home" to="/">← Back to Pacemate</RouterLink></section>
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

<style scoped>
.auth-flow{display:grid;grid-template-columns:1fr 1fr;min-height:100svh;background:var(--bg)}.auth-story{position:relative;isolation:isolate;min-height:100%;background:#193d2e;overflow:hidden;color:#fff}.story-photo{position:absolute;inset:0;height:100%;width:100%;object-fit:cover;object-position:50% 40%;z-index:-2}.auth-story:after{content:'';position:absolute;inset:0;z-index:-1;background:rgba(16,44,35,.48)}.story-brand{position:absolute;top:35px;left:44px;display:flex;align-items:center;gap:10px;color:#fff;font:700 27px var(--display);text-decoration:none;letter-spacing:-1px}.story-brand i{width:25px;height:25px;border-radius:12px;background:#244f3b;transform:none}.story-copy{position:absolute;left:44px;right:30px;bottom:54px}.story-copy h2{font-size:clamp(36px,4.2vw,64px);font-weight:600;letter-spacing:-.045em;line-height:1.05}.story-copy em{color:#efa17c;font-family:Georgia,serif;font-weight:400}.story-sports{display:flex;gap:8px;flex-wrap:wrap;margin-top:25px}.story-sports span{font-size:11px;padding:6px 11px;border:1px solid #ffffff40;border-radius:12px;background:#ffffff10}.story-sports span:last-child{border:0;background:none;padding-left:0;flex-basis:100%;margin-top:6px;color:#e4e9dd}.auth{width:100%;max-width:510px;padding:70px 45px;margin:auto;align-self:center}.auth .card{padding:0;border:0;border-radius:12px;background:none}.auth h1{font-size:clamp(30px,3vw,42px);letter-spacing:-.04em;margin-bottom:32px;font-weight:600;max-width:11ch}.auth input:not([type=checkbox]){border:1px solid var(--line);min-height:52px;font-size:14px}.auth .field{margin-bottom:21px}.auth .field>span{font-size:12px;margin-bottom:9px}.auth .check{font-size:12px;line-height:1.7;margin:7px 0 24px;gap:11px}.check input{accent-color:var(--green);width:18px;height:18px}.auth form>.btn{border-width:0;background:#267452;color:#fff;min-height:51px;font-size:14px}.alt{font-size:12px;margin-top:24px}.back-home{display:inline-block;color:var(--mute);font-size:11px;text-decoration:none;margin-top:38px}.mobile-brand{display:none}.oauth .btn{border-width:1px;font-size:13px}.ok{font-size:14px;line-height:1.7}.err{font-size:13px}
@media(max-width:700px){.auth-flow{grid-template-columns:1fr}.auth-story{min-height:270px}.story-brand{top:22px;left:24px;font-size:24px}.story-copy{left:24px;bottom:24px;right:22px}.story-copy h2{font-size:34px}.story-sports{display:none}.story-photo{object-position:50% 40%}.auth-story:after{background:rgba(16,44,35,.48)}.auth{max-width:490px;padding:34px 26px 40px}.auth h1{font-size:32px;max-width:none;margin-bottom:26px}.back-home{margin-top:26px}}
</style>

<style scoped>
.auth-flow{display:grid;grid-template-columns:1fr 1fr;min-height:100svh;background:var(--bg)}.auth-story{position:relative;isolation:isolate;min-height:100%;background:#193d2e;overflow:hidden;color:#fff}.story-photo{position:absolute;inset:0;height:100%;width:100%;object-fit:cover;object-position:50% 40%;z-index:-2}.auth-story:after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(0deg,#102c23f5,transparent 70%),linear-gradient(180deg,#102c2360,transparent 25%)}.story-brand{position:absolute;top:35px;left:44px;display:flex;align-items:center;gap:10px;color:#fff;font:700 27px var(--display);text-decoration:none;letter-spacing:-1px}.story-brand i{width:25px;height:25px;border-radius:50% 50% 50% 6px;background:linear-gradient(135deg,#e4eccb 55%,#ee8b63 55%);transform:rotate(-20deg)}.story-copy{position:absolute;left:44px;right:30px;bottom:54px}.story-copy h2{font-size:clamp(36px,4.2vw,64px);font-weight:600;letter-spacing:-.045em;line-height:1.05}.story-copy em{color:#efa17c;font-family:Georgia,serif;font-weight:400}.story-sports{display:flex;gap:8px;flex-wrap:wrap;margin-top:25px}.story-sports span{font-size:11px;padding:6px 11px;border:1px solid #ffffff40;border-radius:999px;background:#ffffff10}.story-sports span:last-child{border:0;background:none;padding-left:0;flex-basis:100%;margin-top:6px;color:#e4e9dd}.auth{width:100%;max-width:510px;padding:70px 45px;margin:auto;align-self:center}.auth .card{padding:0;border:0;border-radius:0;background:none}.auth h1{font-size:clamp(30px,3vw,42px);letter-spacing:-.04em;margin-bottom:32px;font-weight:600;max-width:11ch}.auth input:not([type=checkbox]){border:1px solid var(--line);min-height:52px;font-size:14px}.auth .field{margin-bottom:21px}.auth .field>span{font-size:12px;margin-bottom:9px}.auth .check{font-size:12px;line-height:1.7;margin:7px 0 24px;gap:11px}.check input{accent-color:var(--green);width:18px;height:18px}.auth form>.btn{border-width:0;background:#267452;color:#fff;min-height:51px;font-size:14px}.alt{font-size:12px;margin-top:24px}.back-home{display:inline-block;color:var(--mute);font-size:11px;text-decoration:none;margin-top:38px}.mobile-brand{display:none}.oauth .btn{border-width:1px;font-size:13px}.ok{font-size:14px;line-height:1.7}.err{font-size:13px}
@media(max-width:700px){.auth-flow{grid-template-columns:1fr}.auth-story{min-height:270px}.story-brand{top:22px;left:24px;font-size:24px}.story-copy{left:24px;bottom:24px;right:22px}.story-copy h2{font-size:34px}.story-sports{display:none}.story-photo{object-position:50% 40%}.auth-story:after{background:linear-gradient(0deg,#102c23e6,transparent 95%)}.auth{max-width:490px;padding:34px 26px 40px}.auth h1{font-size:32px;max-width:none;margin-bottom:26px}.back-home{margin-top:26px}}
</style>

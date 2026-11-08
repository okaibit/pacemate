<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { login, signup, requestPasswordRecovery, oauthLogin, getSettings } from "../supabase.js";
import { session, loadProfile } from "../auth.js";
import { api } from "../api.js";
import Modal from "../components/Modal.vue";

const props = defineProps({ mode: String });
const router = useRouter();
const route = useRoute();
const emailMethod = ref(false);
const email = ref(""), password = ref(""), adult = ref(false);
const busy = ref(false), err = ref(""), done = ref("");
const providers = ref({}), providersLoading = ref(false), providersError = ref("");
const titles = { login: "Back to your people.", signup: "Your story starts here.", forgot: "Reset your password" };
watch(()=>props.mode,()=>{err.value="";done.value="";password.value="";emailMethod.value=false;});
const needsAcknowledgement = computed(() => !!session.user && !session.adultTermsAccepted);
const oauth = computed(() => Object.entries(providers.value).filter(([k, on]) => on && ["google", "github"].includes(k)).map(([k]) => k));

function close(){if(!busy.value)router.push("/");}
function chooseEmail(){emailMethod.value=true;err.value="";}

async function retryProfile() {
  busy.value = true; err.value = "";
  try { await loadProfile(); router.replace(!session.adultTermsAccepted ? "/login" : session.profile ? "/app/discover" : "/onboarding"); }
  catch (e) { err.value = e.message; }
  finally { busy.value = false; }
}

async function acceptTerms() {
  if (busy.value) return;
  err.value = "";
  if (!adult.value) { err.value = "Confirm you are 18 or older and accept the terms."; return; }
  const owner = session.user?.id;
  busy.value = true;
  try {
    await api("/api/me", { method: "POST", body: { adultTermsAccepted: true }, expectedUserId: owner });
    await loadProfile();
    if (session.user?.id !== owner) throw new Error("Your account changed. Refresh this page.");
    if (!session.adultTermsAccepted) throw new Error("Could not verify your acknowledgement. Please try again.");
    await router.replace(session.profile ? "/app/discover" : "/onboarding");
  } catch (e) { err.value = explain(e); }
  finally { busy.value = false; }
}

async function loadProviders() {
  if (providersLoading.value) return;
  providersLoading.value = true; providersError.value = "";
  try { providers.value = (await getSettings()).providers || {}; }
  catch { providersError.value = "Could not load other sign-in options."; }
  finally { providersLoading.value = false; }
}
onMounted(() => {
  if (session.callback === "error") session.callback = null;
  loadProviders();
});

function explain(e) {
  if (/email.*confirm|confirm.*email/i.test(e.message)) return "Confirm your email first. Check your inbox.";
  if (e.status === 429) return "Too many attempts. Wait a minute and try again.";
  return e.message || "Something went wrong. Please try again.";
}
async function startOAuth(provider) {
  if (busy.value || !oauth.value.includes(provider)) return;
  err.value = ""; session.notice = "";
  if (props.mode === "signup" && !adult.value) { err.value = "Accept the terms and confirm you are 18 or older."; return; }
  busy.value = true;
  try { await oauthLogin(provider); } catch (e) { err.value = explain(e); busy.value = false; }
}

async function finish(user) {
  session.user = user;
  await loadProfile();
  const next = typeof route.query.next === "string" && route.query.next.startsWith("/") ? route.query.next : "/app/discover";
  router.replace(!session.adultTermsAccepted ? "/login" : session.profile ? next : "/onboarding");
}

async function submit() {
  if (busy.value) return;
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
 <main class="auth-page">
  <div class="auth-background" aria-hidden="true"><span>Pacemate</span><p>A shared pace.<br>A new beginning.</p></div>
  <Modal :label="mode==='signup'?'Create your Pacemate account':'Log in to Pacemate'" plain flush @close="close">
   <section class="auth-sheet">
    <button type="button" class="close" :disabled="busy" aria-label="Close" @click="close">×</button>
    <RouterLink class="brand" to="/">Pacemate</RouterLink>
    <h1>{{ needsAcknowledgement?'Before you continue.':done?(mode==='signup'?'Check your inbox.':'On its way.'):mode==='forgot'?'Reset your password':emailMethod?titles[mode]:mode==='signup'?'Get started.':'Welcome back.' }}</h1>
    <p v-if="session.notice" class="notice" role="alert">{{ session.notice }}</p>
    <div v-if="session.user&&session.profileError"><p class="error" role="alert">{{ session.profileError }}</p><button type="button" class="method" :disabled="busy" @click="retryProfile">Retry loading your profile</button></div>
    <p v-if="done" class="notice" role="status">{{ done }}</p>
    <template v-else>
     <label v-if="needsAcknowledgement||mode==='signup'" class="adult"><input v-model="adult" type="checkbox" :disabled="busy"><span>I am 18 or older and accept the <RouterLink to="/terms" target="_blank">terms</RouterLink> and <RouterLink to="/privacy" target="_blank">privacy policy</RouterLink>.</span></label>
     <form v-if="needsAcknowledgement" @submit.prevent="acceptTerms" :aria-busy="busy"><button class="method primary" :disabled="busy">{{ busy?'Saving…':'Accept and continue' }}</button></form>
     <div v-else-if="!emailMethod&&mode!=='forgot'" class="methods">
      <button type="button" class="method email" :disabled="busy" @click="chooseEmail"><span aria-hidden="true">@</span>{{ mode==='signup'?'Sign up with email':'Log in with email' }}</button>
      <button type="button" class="method google" :disabled="busy||providersLoading||!oauth.includes('google')" @click="startOAuth('google')"><span aria-hidden="true">G</span>Continue with Google</button>
      <p v-if="providersLoading" class="hint" role="status">Loading sign-in options…</p>
      <p v-else-if="providersError" class="hint" role="status">{{ providersError }} <button type="button" class="text-button" :disabled="busy" @click="loadProviders">Retry</button></p>
      <p v-else-if="!oauth.includes('google')" class="hint">Google sign-in is unavailable right now. You can continue with email.</p>
     </div>
     <form v-else @submit.prevent="submit" :aria-busy="busy" novalidate>
      <label class="field"><span>Email</span><input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" :disabled="busy" required></label>
      <label v-if="mode!=='forgot'" class="field"><span>Password</span><input v-model="password" type="password" :autocomplete="mode==='signup'?'new-password':'current-password'" :placeholder="mode==='signup'?'At least 8 characters':'Your password'" :disabled="busy" minlength="8" required></label>
      <button class="method primary" :disabled="busy">{{ busy?'Please wait…':mode==='signup'?'Create account':mode==='login'?'Log in':'Send reset link' }}</button>
      <button v-if="mode!=='forgot'" type="button" class="text-button" :disabled="busy" @click="emailMethod=false;err=''">Other sign-in options</button>
     </form>
     <p v-if="err" class="error" role="alert">{{ err }}</p>
    </template>
    <RouterLink v-if="mode!=='forgot'" class="help-link" to="/forgot">Trouble logging in?</RouterLink>
    <p class="switch-mode"><template v-if="mode==='signup'">Already a member? <RouterLink to="/login">Log in</RouterLink></template><template v-else-if="mode==='login'">New here? <RouterLink to="/signup">Create an account</RouterLink></template><RouterLink v-else to="/login">Back to log in</RouterLink></p>
   </section>
  </Modal>
 </main>
</template>
<style scoped>
.auth-page{min-height:100svh;background:var(--bg);color:var(--ink)}
.auth-background{max-width:1200px;margin:auto;padding:42px 32px}.auth-background>span{font:700 28px var(--display);letter-spacing:-1px}.auth-background>p{font:600 clamp(44px,7vw,100px)/1.05 var(--display);letter-spacing:-.04em;margin:18vh 0 0}
.auth-sheet{position:relative;padding:42px 32px 28px;text-align:center;color:var(--ink)}
.close{position:absolute;right:6px;top:6px;display:grid;place-items:center;min-width:44px;min-height:44px;border:0;background:none;color:var(--mute);font:400 26px var(--body);cursor:pointer}
.brand{display:inline-block;text-decoration:none;font:700 23px var(--display);letter-spacing:-.8px;margin-bottom:22px}
.auth-sheet h1{font:600 32px/1.15 var(--display);letter-spacing:-.03em;margin:0 0 24px}
.methods{display:grid;gap:12px}.method{display:flex;align-items:center;justify-content:center;position:relative;gap:12px;width:100%;min-height:48px;padding:12px 34px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);font:600 14px var(--body);cursor:pointer;text-decoration:none}
.method>span{position:absolute;left:14px;font-size:18px}.google,.primary{background:var(--ink);border-color:var(--ink);color:var(--bg)}
button:disabled{opacity:.5;cursor:not-allowed}.adult{display:flex;text-align:left;align-items:flex-start;gap:10px;font-size:12px;line-height:1.6;color:var(--mute);margin:0 0 24px}.adult input{flex:none;width:18px;height:18px;margin-top:2px;accent-color:var(--green)}.adult a{text-underline-offset:3px}
.field{text-align:left;margin-bottom:18px}.field>span{font-size:12px}.field input{min-height:48px;font-size:16px;border-radius:12px;background:var(--bg);color:var(--ink)}
.hint,.notice{font-size:12px;line-height:1.65;color:var(--mute);margin:0}.notice{margin:0 0 20px}.error{font-size:13px;line-height:1.6;color:var(--danger);margin:16px 0}
.text-button{min-height:44px;border:0;padding:10px 4px;background:none;color:var(--ink);font:500 12px var(--body);text-decoration:underline;cursor:pointer;text-underline-offset:3px}
.help-link{display:inline-block;min-height:44px;padding:14px 4px;font-size:12px;text-underline-offset:3px}.switch-mode{font-size:12px;color:var(--mute);margin:16px 0 0;line-height:1.7}.switch-mode a{color:var(--ink);text-underline-offset:3px}
@media(max-width:480px){.auth-sheet{padding:40px 24px 26px}.auth-sheet h1{font-size:29px}.auth-background{padding:28px 20px}}
</style>

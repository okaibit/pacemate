import { reactive } from "vue";
import { authClient } from "./supabase.js";
import { api } from "./api.js";
import { disablePush } from "./pwa.js";

export const session = reactive({ ready: false, user: null, profile: null, profileError: "", callback: null, notice: "" });
let profileRequest = 0;
export async function loadProfile() {
  const id = session.user?.id;
  const request = ++profileRequest;
  if (!id) { session.profile = null; session.profileError = ""; return; }
  try {
    const result = await api("/api/me");
    if (request === profileRequest && session.user?.id === id) {
      session.profile = result.profile;
      session.profileError = "";
    }
  } catch (error) {
    if (request === profileRequest) session.profileError = error.message;
    throw error;
  }
}

export async function initAuth() {
  try {
    const result = await authClient.handleCallback();
    if (result) {
      session.callback = result.type;
      if (result.type === "recovery") window.sessionStorage.setItem("pacemate-recovery", "1");
      if (result.type === "confirmation") session.notice = "Email confirmed. Welcome to Pacemate.";
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
    session.user = await authClient.getUser();
    if (session.user && window.sessionStorage.getItem("pacemate-recovery")) session.callback = "recovery";
    await loadProfile();
  } catch (error) { session.notice = error.message || "Could not restore your session."; }
  finally { session.ready = true; }
  authClient.onChange((event, user) => {
    const previousId=session.user?.id;
    const changed = (previousId || null) !== (user?.id || null);
    if(previousId&&user?.id&&previousId!==user.id){
      session.user=user;session.profile=null;session.ready=false;
      window.location.replace("/");return;
    }
    session.user = user;
    if (!user) {
      ++profileRequest; session.profile = null; session.profileError = ""; session.callback = null;
      window.sessionStorage.removeItem("pacemate-recovery");
    } else if (changed) {
      setTimeout(() => loadProfile().catch(() => {}), 0);
    }
  });
}

export async function logout() {
  try { await disablePush(); } catch {}
  try { await authClient.logout(); } catch (error) { session.notice = error.message; }
  session.user = null; session.profile = null; session.profileError = "";
}

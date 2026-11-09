import { reactive } from "vue";
import { authClient } from "./supabase.js";
import { api } from "./api.js";
import { disablePush } from "./pwa.js";

export const session = reactive({ ready: false, user: null, profile: null, profileError: "", adultTermsAccepted: false, callback: null, notice: "" });
let profileRequest = 0, profileFlight;
export function loadProfile() {
  const id=session.user?.id;
  if(!id){session.profile=null;session.adultTermsAccepted=false;session.profileError="";return Promise.resolve();}
  if(profileFlight?.id===id)return profileFlight.promise;
  const request=++profileRequest;
  const promise=api("/api/me",{expectedUserId:id}).then(result=>{
    if(request===profileRequest&&session.user?.id===id){session.profile=result.profile;session.adultTermsAccepted=result.adultTermsAccepted===true;session.profileError="";}
  }).catch(error=>{
    if(request===profileRequest&&session.user?.id===id)session.profileError=error.message;
    throw error;
  }).finally(()=>{if(profileFlight?.request===request)profileFlight=null;});
  profileFlight={id,request,promise};
  return promise;
}

export async function initAuth() {
  try {
    let result;
    try { result = await authClient.handleCallback(); }
    catch (error) {
      // Render the callback error on Auth, without retaining tokens/codes in the URL.
      session.callback = "error";
      window.history.replaceState({}, "", "/login");
      throw error;
    }
    if (result) {
      session.callback = result.type;
      if (result.type === "recovery") window.sessionStorage.setItem("pacemate-recovery", "1");
      if (result.type === "confirmation") session.notice = "Email confirmed. Welcome to Pacemate.";
      const query = new URLSearchParams(window.location.search);
      query.delete("code"); query.delete("auth_state");
      window.history.replaceState({}, "", window.location.pathname + (query.size ? "?" + query : ""));
    }
    session.user = result ? (await authClient.getSession())?.user || null : await authClient.getUser();
    if (session.user && window.sessionStorage.getItem("pacemate-recovery")) session.callback = "recovery";
    await loadProfile();
  } catch (error) {
    session.notice = error.message || "Could not restore your session.";
    if(session.callback!=="error"&&!session.user){
      const saved=authClient.peekSession?.();
      if(saved?.user?.id){session.user=saved.user;session.profileError="Your sign-in is saved, but we couldn’t reconnect. Please retry.";}
    }
  }
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
      ++profileRequest; session.profile = null; session.adultTermsAccepted = false; session.profileError = ""; session.callback = null;
      window.sessionStorage.removeItem("pacemate-recovery");
    } else if (changed) {
      loadProfile().catch(() => {});
    }
  });
}

export async function logout() {
  try { await disablePush(); } catch (error) { session.notice = error.message; throw error; }
  try { await authClient.logout(); } catch (error) { session.notice = error.message; }
  session.user = null; session.profile = null; session.adultTermsAccepted = false; session.profileError = "";
}

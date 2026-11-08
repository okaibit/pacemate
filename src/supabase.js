import { createAuthClient } from "./auth-client.js";

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
export const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const API_URL = (import.meta.env.VITE_API_URL || `${SUPABASE_URL}/functions/v1/pacemate`).replace(/\/$/, "");
export const authClient = createAuthClient({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, storage: window.localStorage, transactionStorage: window.sessionStorage, location: window.location });

window.addEventListener("storage", event => { if (event.key === authClient.storageKey) authClient.sync(); });
// Refresh while the app is open, including after a laptop wakes up.
const refresh = () => { if (document.visibilityState === "visible") authClient.getSession().catch(() => {}); };
window.setInterval(refresh, 30000);
document.addEventListener("visibilitychange", refresh);

export const login = (...args) => authClient.login(...args);
export const signup = (...args) => authClient.signup(...args);
export const requestPasswordRecovery = email => authClient.recover(email);
export const updateUser = body => authClient.updateUser(body);
export const getSettings = async () => {
  const settings = await authClient.getSettings();
  return { ...settings, providers: settings.external || {} };
};
export const oauthLogin = provider => authClient.oauth(provider);

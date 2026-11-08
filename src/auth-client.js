// Supabase Auth's HTTP API keeps authentication independent of the hosting provider.
// Sessions are persisted; callback transactions use per-tab sessionStorage. Passwords are never stored.
export function createAuthClient({ url, key, storage, transactionStorage = storage, fetcher = fetch, location }) {
  const storageKey = `pacemate-auth:${url}`;
  const transactionKey = `${storageKey}:transaction`;
  const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  function begin(kind, path = "/") {
    const transaction = { state: random(), kind, createdAt: Date.now(), ...(kind === "oauth" ? { verifier: random() } : {}) };
    transactionStorage.setItem(transactionKey, JSON.stringify(transaction));
    const redirect = new URL(path, location.origin);
    redirect.searchParams.set("auth_state", transaction.state);
    return { transaction, redirect: redirect.href };
  }
  const listeners = new Set();
  let refreshing;
  const read = () => { try { return JSON.parse(storage.getItem(storageKey) || "null"); } catch { return null; } };
  const emit = (event, value) => listeners.forEach(fn => fn(event, value?.user || null));
  const persist = (value, event) => {
    if (value) storage.setItem(storageKey, JSON.stringify(value));
    else storage.removeItem(storageKey);
    if (event) emit(event, value);
    return value;
  };
  function assertConfigured() {
    if (!url || !key) throw new Error("Supabase is not configured. Set the VITE_SUPABASE environment variables and restart Vite.");
  }
  async function request(path, { method = "POST", body, token } = {}) {
    assertConfigured();
    let response;
    try {
      response = await fetcher(`${url}/auth/v1${path}`, {
        method, headers: { apikey: key, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
    } catch { throw new Error("Cannot reach Supabase. Check your connection and try again."); }
    const data = response.status === 204 ? {} : await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(data?.msg || data?.error_description || data?.message || data?.error || "Authentication failed."), { status: response.status });
    if (!data) throw new Error("Supabase returned an unexpected response.");
    return data;
  }
  const saveTokens = (data, event) => {
    if (!data.access_token || !data.refresh_token || !data.user?.id) throw new Error("Supabase returned an incomplete session.");
    return persist({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Number(data.expires_at) || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600), user: data.user }, event);
  };
  async function getSession() {
    const current = read();
    if (!current?.access_token) return null;
    if (current.expires_at > Date.now() / 1000 + 60) return current;
    if (!refreshing) refreshing = request("/token?grant_type=refresh_token", { body: { refresh_token: current.refresh_token } })
      .then(data => {
        // A logout, new login, or another tab may have replaced this session
        // while the refresh was in flight. Never resurrect or overwrite it.
        const latest = read();
        if (!latest || latest.refresh_token !== current.refresh_token) return latest;
        return saveTokens(data, "TOKEN_REFRESHED");
      })
      .catch(error => {
        if ([400, 401, 403].includes(error.status) && read()?.refresh_token === current.refresh_token) persist(null, "SIGNED_OUT");
        throw error;
      })
      .finally(() => { refreshing = null; });
    return refreshing;
  }
  async function handleCallback() {
    const params = new URLSearchParams((location.hash || "").slice(1));
    const query = new URLSearchParams(location.search || "");
    const isCallback = query.has("code") || query.has("auth_state") || ["access_token", "refresh_token", "error", "error_description"].some(key => params.has(key) || query.has(key));
    if (!isCallback) return null;
    let pending;
    try { pending = JSON.parse(transactionStorage.getItem(transactionKey) || "null"); }
    catch { pending = null; }
    finally { transactionStorage.removeItem(transactionKey); }
    const invalid = () => new Error("Sign-in callback rejected. Start sign-in again in this browser; the link is missing, expired or already used.");
    if (!pending || query.getAll("auth_state").length !== 1 || query.get("auth_state") !== pending.state || !Number.isFinite(pending.createdAt) || Date.now() - pending.createdAt > 60 * 60 * 1000 || pending.createdAt > Date.now()) throw invalid();
    if (params.has("error") || params.has("error_description") || query.has("error") || query.has("error_description")) throw new Error("Sign-in was cancelled or failed. Start sign-in again.");
    if (pending.kind === "oauth") {
      if (!pending.verifier || query.getAll("code").length !== 1 || !query.get("code") || params.has("access_token") || params.has("refresh_token")) throw invalid();
      const data = await request("/token?grant_type=pkce", { body: { auth_code: query.get("code"), code_verifier: pending.verifier } });
      if (!data.access_token || !data.refresh_token) throw new Error("Sign-in callback returned an incomplete session. Start sign-in again.");
      const user = await request("/user", { method: "GET", token: data.access_token });
      saveTokens({ ...data, user }, "SIGNED_IN");
      return { type: "oauth" };
    }
    if (!["confirmation", "recovery"].includes(pending.kind) || query.has("code") || params.get("type") !== (pending.kind === "recovery" ? "recovery" : "signup") || params.getAll("access_token").length !== 1 || !params.get("access_token") || !params.get("refresh_token")) throw invalid();
    const user = await request("/user", { method: "GET", token: params.get("access_token") });
    saveTokens({ access_token: params.get("access_token"), refresh_token: params.get("refresh_token"), expires_in: params.get("expires_in"), user }, "SIGNED_IN");
    return { type: pending.kind };
  }
  return {
    storageKey, getSession, handleCallback,
    clear() { transactionStorage.removeItem(transactionKey); persist(null, "SIGNED_OUT"); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    sync() { emit(read() ? "SIGNED_IN" : "SIGNED_OUT", read()); },
    async getUser() {
      const value = await getSession();
      if (!value) return null;
      try { return await request("/user", { method: "GET", token: value.access_token }); }
      catch (error) { if ([401, 403].includes(error.status)) { persist(null, "SIGNED_OUT"); return null; } throw error; }
    },
    async login(email, password) { const data = await request("/token?grant_type=password", { body: { email, password } }); saveTokens(data, "SIGNED_IN"); return data.user; },
    async signup(email, password) {
      const { redirect } = begin("confirmation");
      const data = await request(`/signup?redirect_to=${encodeURIComponent(redirect)}`, { body: { email, password } });
      if (data.access_token) { transactionStorage.removeItem(transactionKey); saveTokens(data, "SIGNED_IN"); }
      return { ...(data.user || data), emailVerified: !!data.access_token };
    },
    async recover(email) {
      const { redirect } = begin("recovery", "/reset-password");
      await request(`/recover?redirect_to=${encodeURIComponent(redirect)}`, { body: { email } });
    },
    async updateUser(body) {
      const value = await getSession();
      if (!value) throw Object.assign(new Error("Please log in."), { status: 401 });
      const user = await request("/user", { method: "PUT", token: value.access_token, body });
      persist({ ...value, user }, "USER_UPDATED");
      return user;
    },
    async logout() {
      const value = read();
      try { if (value) await request("/logout", { token: value.access_token }); }
      finally { transactionStorage.removeItem(transactionKey); persist(null, "SIGNED_OUT"); }
    },
    getSettings: () => request("/settings", { method: "GET" }),
    async oauth(provider) {
      assertConfigured();
      const { transaction, redirect } = begin("oauth");
      try {
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(transaction.verifier)));
        const challenge = btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
        location.assign(`${url}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=s256`);
      } catch (error) { transactionStorage.removeItem(transactionKey); throw error; }
    },
  };
}

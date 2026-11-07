import {normalizeProfileResponse} from "../supabase/functions/pacemate/server/profile-data.js";
import { authClient, API_URL, SUPABASE_URL, PUBLISHABLE_KEY } from "./supabase.js";

export async function api(path, { method = "GET", body, raw, expectedUserId } = {}) {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY) throw new Error("Supabase is not configured. Restart Vite after setting .env.local.");
  if (!path.startsWith("/api/")) throw new Error("Invalid API path.");
  const session = await authClient.getSession();
  if(expectedUserId&&session?.user?.id!==expectedUserId)throw new Error("Your account changed. Refresh this page.");
  const headers = { apikey: PUBLISHABLE_KEY };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  if (body !== undefined) headers["Content-Type"] = raw || "application/json";
  let res;
  try {
    res = await fetch(API_URL + path, { method, headers, body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  } catch {
    throw Object.assign(new Error("Cannot reach the backend. Check your connection and Supabase function deployment."), { status: 0 });
  }
  const data = await res.json().catch(() => null);
  if(expectedUserId&&(await authClient.getSession())?.user?.id!==expectedUserId)throw new Error("Your account changed. Refresh this page.");
  if (res.status === 401) authClient.clear();
  if (!res.ok) throw Object.assign(new Error(data?.error || data?.message || "The backend is unavailable."), { status: res.status });
  if (!data || typeof data !== "object") throw new Error("The backend returned an unexpected response.");
  return normalizeProfileResponse(data);
}

export const photoUrl = (key) => (key ? `${SUPABASE_URL}/storage/v1/object/public/photos/${key.split("/").map(encodeURIComponent).join("/")}` : "");

/** Downscales an image file to a JPEG of at most 1200px on the long side. */
export function resizeImage(file, max = 1200) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read that image."))), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file is not an image we can read.")); };
    img.src = url;
  });
}

export async function uploadPhoto(file, expectedUserId) {
  expectedUserId ||= (await authClient.getSession())?.user?.id;
  if(!expectedUserId)throw new Error("Please log in.");
  const blob = await resizeImage(file);
  const { key } = await api("/api/photos", { method: "POST", body: blob, raw: "image/jpeg", expectedUserId });
  return key;
}

export function formatEventTime(iso, timeZone) {
  const d = new Date(iso);
  const opts = { timeZone, weekday: "short", day: "numeric", month: "short" };
  return {
    day: new Intl.DateTimeFormat(undefined, opts).format(d),
    time: new Intl.DateTimeFormat(undefined, { timeZone, hour: "2-digit", minute: "2-digit" }).format(d),
  };
}

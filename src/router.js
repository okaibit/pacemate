import { createRouter, createWebHistory } from "vue-router";
import { session } from "./auth.js";
import { SITE_URL, DEFAULT_TITLE, DEFAULT_DESCRIPTION, DESCRIPTIONS, INDEXABLE } from "./seo.js";

const routes = [
  { path: "/help", component: () => import("./views/Help.vue"), meta: { title: "Help" } },
  { path: "/chat/:conversationId", redirect: to => `/app/matches/${encodeURIComponent(to.params.conversationId)}` },
  { path: "/", component: () => import("./views/Landing.vue"), meta: { title: "" } },
  { path: "/login", component: () => import("./views/Auth.vue"), props: { mode: "login" }, meta: { guest: true, title: "Log in" } },
  { path: "/signup", component: () => import("./views/Auth.vue"), props: { mode: "signup" }, meta: { guest: true, title: "Create account" } },
  { path: "/forgot", component: () => import("./views/Auth.vue"), props: { mode: "forgot" }, meta: { guest: true, title: "Reset password" } },
  { path: "/reset-password", component: () => import("./views/ResetPassword.vue"), meta: { auth: true, title: "New password" } },
  { path: "/onboarding", component: () => import("./views/Onboarding.vue"), meta: { auth: true, title: "Set up your profile" } },
  {
    path: "/app", component: () => import("./views/AppLayout.vue"), meta: { auth: true, profile: true },
    children: [
      { path: "", redirect: "/app/discover" },
      { path: "today", component: () => import("./views/Today.vue"), meta: { title: "Today" } },
      { path: "discover", component: () => import("./views/Discover.vue"), meta: { title: "Discover" } },
      { path: "plus", component: () => import("./views/Plus.vue"), meta: { title: "Pacemate Plus" } },
      { path: "likes", component: () => import("./views/Likes.vue"), meta: { title: "Likes" } },
      { path: "matches", component: () => import("./views/Matches.vue"), meta: { title: "Matches" } },
      { path: "matches/:id", component: () => import("./views/ChatView.vue"), meta: { title: "Chat", directChat: true } },
      { path: "events", component: () => import("./views/Events.vue"), meta: { title: "Events" } },
      { path: "run-clubs", component: () => import("./views/RunClubs.vue"), meta: { title: "Run clubs" } },
      { path: "run-clubs/:id", component: () => import("./views/RunClub.vue"), meta: { title: "Run club" } },
      { path: "settings", component: () => import("./views/Settings.vue"), meta: { title: "Settings" } },
      { path: "notifications", component: () => import("./views/Notifications.vue"), meta: { title: "Notifications" } },
      { path: "admin", component: () => import("./views/Admin.vue"), meta: { title: "Moderation", admin: true } },
      { path: "events/:id/chat", component: () => import("./views/SessionChat.vue"), meta: { title: "Session chat" } },
      { path: "profile/edit", component: () => import("./views/FoundationProfile.vue"), meta: { title: "Edit full profile" } },
      { path: "profile/member/:id", component: () => import("./views/MemberProfile.vue"), meta: { title: "Member profile" } },
      { path: "profile", component: () => import("./views/Profile.vue"), meta: { title: "Your profile" } },
    ],
  },
  { path: "/unsubscribe", component: () => import("./views/Unsubscribe.vue"), meta: { title: "Email preferences" } },
  { path: "/privacy", component: () => import("./views/Legal.vue"), props: { doc: "privacy" }, meta: { title: "Privacy policy" } },
  { path: "/terms", component: () => import("./views/Legal.vue"), props: { doc: "terms" }, meta: { title: "Terms of service" } },
  { path: "/safety", component: () => import("./views/Legal.vue"), props: { doc: "safety" }, meta: { title: "Safety tips" } },
  { path: "/:rest(.*)*", component: () => import("./views/NotFound.vue"), meta: { title: "Page not found" } },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved || (to.hash ? { el: to.hash } : { top: 0 }),
});

router.beforeEach((to) => {
  if (session.callback === "error" && to.path !== "/login") return "/login";
  if (session.user && session.callback === "recovery" && to.path !== "/reset-password") return "/reset-password";
  const signedIn = !!session.user;
  if (signedIn && !session.adultTermsAccepted && (to.meta.auth || to.path === "/") && to.path !== "/reset-password") return "/login";
  if (to.meta.admin && !session.profile?.isAdmin) return "/app/discover";
  if (session.profile?.suspended && to.path.startsWith("/app/") && !["/app/profile", "/app/plus"].includes(to.path)) return "/app/profile";
  if (to.meta.auth && !signedIn) return { path: "/login", query: { next: to.fullPath } };
  if (to.meta.guest && signedIn && session.adultTermsAccepted && !session.profileError) return session.profile ? "/app/discover" : "/onboarding";
  if (to.matched.some((r) => r.meta.profile) && session.profileError) return { path: "/login", query: { next: to.fullPath } };
  if (to.matched.some((r) => r.meta.profile) && !session.profile) return "/onboarding";
  if (to.path === "/onboarding" && session.profile) return "/app/discover";
});

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", content);
}

router.afterEach((to) => {
  const title = to.meta.title ? `${to.meta.title} · Pacemate` : DEFAULT_TITLE;
  const description = DESCRIPTIONS[to.path] || DEFAULT_DESCRIPTION;
  const url = SITE_URL + to.path;
  const known = to.matched.length && !to.matched.some((r) => r.path === "/:rest(.*)*");
  document.title = title;
  setMeta("name", "description", description);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", url);
  // Only public marketing pages are indexed; app screens, auth and 404s are not.
  setMeta("name", "robots", INDEXABLE.includes(to.path) ? "index, follow, max-image-preview:large" : "noindex, follow");
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
  link.href = known ? url : SITE_URL + "/";
});

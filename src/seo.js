// Shared SEO/AEO content. Used by the landing page (visible FAQ), the router
// (per-page meta tags) and vite.config.js (structured data + crawlable HTML).
export const SITE_URL = "https://trypacemate.omejeelijahokai02.workers.dev";
export const SITE_NAME = "Pacemate";
export const DEFAULT_TITLE = "Pacemate: dating and community for athletes and active singles";
export const DEFAULT_DESCRIPTION =
  "Pacemate matches athletes and active singles by shared sports and training routines, then gets you together at local runs, rides, climbs and surf sessions.";

// Written as direct question/answer pairs so search engines and AI answer
// engines can quote them.
export const FAQ = [
  {
    q: "What is Pacemate?",
    a: "Pacemate is a dating and community app for athletes and active singles. It matches you with people who share your sports, fitness level and training routine, and helps you meet at local group sessions like runs, rides, climbs, yoga and surf.",
  },
  {
    q: "Is Pacemate free?",
    a: "Yes. Creating a profile, matching, chatting, joining events and using the daily tracking features are free. You must be 18 or older to join.",
  },
  {
    q: "How does Pacemate match people?",
    a: "You pick your sports, level, usual training time, city and what you are looking for (a relationship, something casual, a training partner or friends). Pacemate shows people with the most in common first. When two people like each other it is a match and the chat opens.",
  },
  {
    q: "Which sports does Pacemate support?",
    a: "Running, cycling, climbing, bouldering, surfing, yoga, padel, tennis, CrossFit, swimming, hiking, triathlon and many more.",
  },
  {
    q: "Which cities is Pacemate in?",
    a: "Pacemate is open worldwide, with community sessions in cities across Europe, the Americas, Africa, Asia and Oceania, including Lisbon, Barcelona, Berlin, London, Mexico City, Medellín, Lagos, Nairobi, Cape Town, Bali, Tokyo and Sydney.",
  },
  {
    q: "What can I do on Pacemate besides dating?",
    a: "You can log workouts and daily wellbeing check-ins, keep streaks and weekly goals, join monthly challenges with city leaderboards, answer the question of the day, and send kudos when your matches train.",
  },
  {
    q: "Is Pacemate safe?",
    a: "Only matched members can message each other, you can block or report anyone, and the safety guide recommends meeting first at public group sessions.",
  },
];

// Per-route descriptions; routes not listed fall back to DEFAULT_DESCRIPTION.
export const DESCRIPTIONS = {
  "/privacy": "How Pacemate collects, uses and protects your personal data.",
  "/terms": "The terms of service for using Pacemate.",
  "/safety": "Safety tips for meeting people from Pacemate, on and off the app.",
  "/signup": "Create a free Pacemate profile in about two minutes and meet active singles who share your sports.",
  "/login": "Log in to Pacemate.",
};

export const INDEXABLE = ["/", "/signup", "/privacy", "/terms", "/safety"];

export function structuredData() {
  const org = { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/favicon.svg` };
  return {
    "@context": "https://schema.org",
    "@graph": [
      org,
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: SITE_NAME, description: DEFAULT_DESCRIPTION, publisher: { "@id": `${SITE_URL}/#org` }, inLanguage: "en" },
      {
        "@type": "WebApplication", name: SITE_NAME, url: SITE_URL, applicationCategory: "LifestyleApplication",
        operatingSystem: "Web", description: DEFAULT_DESCRIPTION, image: `${SITE_URL}/images/og.jpg`,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, publisher: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

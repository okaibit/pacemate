// Shared SEO/AEO content. Used by the landing page (visible FAQ), the router
// (per-page meta tags) and vite.config.js (structured data + crawlable HTML).
export const SITE_URL = "https://trypacemate.omejeelijahokai02.workers.dev";
export const SITE_NAME = "Pacemate";
export const DEFAULT_TITLE = "Pacemate: training partners, friendship and dating";
export const DEFAULT_DESCRIPTION =
  "Find training partners, friends and dates through shared sports. Discover local sessions, explore travel destinations and connect with free likes, matches and messages.";

// Written as direct question/answer pairs so search engines and AI answer
// engines can quote them.
export const FAQ = [
  {
    q: "What is Pacemate?",
    a: "Pacemate connects adults through fitness, sports, friendship, dating and travel. Choose training partner, friendship or dating connections, discover people who share your interests, and meet at local group sessions.",
  },
  {
    q: "Is Pacemate free?",
    a: "Yes. Unlimited likes, matching, messaging, basic profiles and discovery, your received-like count, basic travel discovery, blocking and reporting are free. Sessions and daily tracking are also free. Plus adds liker profiles and up to five upcoming travel cities. You must be 18 or older to join.",
  },
  {
    q: "How does Pacemate match people?",
    a: "Choose your sports, experience, availability and the connection modes you are open to: training partner, friendship or dating. Discover people nearby or in a destination city. When two people like each other, they match and can message for free.",
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
  {
    q: "What does Pacemate Plus include?",
    a: "Plus lets you view the profiles of people who liked you and manage up to five upcoming travel cities. Free members still see their like count. Unlimited likes, matching and messaging remain free.",
  },
  {
    q: "Can I meet people before I travel?",
    a: "Yes. Basic travel and destination discovery are free, so you can explore connections in a destination city. Plus lets you keep up to five upcoming cities planned at the same time. Available subscription plans and their full billing amounts are shown on the Plus screen.",
  },
];

// Per-route descriptions; routes not listed fall back to DEFAULT_DESCRIPTION.
export const DESCRIPTIONS = {
  "/privacy": "How Pacemate collects, uses and protects your personal data.",
  "/terms": "The terms of service for using Pacemate.",
  "/safety": "Safety tips for meeting people from Pacemate, on and off the app.",
  "/signup": "Create a free Pacemate profile to find training partners, friends and dates who share your sports.",
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

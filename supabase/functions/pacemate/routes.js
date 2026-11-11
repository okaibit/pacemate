/** @type {Array<[string, RegExp, string[]]>} */
const routes = [
  ["location", /^\/api\/location$/, []],
  ["foundation", /^\/api\/foundation\/(sports)$/, ["section"]],
  ["foundation", /^\/api\/foundation(?:\/members\/([^/]+))?$/, ["id"]],
  ["chat", /^\/api\/matches\/(\d+)\/chat$/, ["id"]],
  [
    "admin",
    /^\/api\/admin(?:\/(reports|blocks|verifications|members|actions)(?:\/([^/]+))?)?$/,
    ["section", "id"],
  ],
  ["verification", /^\/api\/verification$/, []],
  ["export", /^\/api\/export$/, []],
  ["settings", /^\/api\/settings(?:\/(blocks)(?:\/([^/]+))?)?$/, [
    "section",
    "id",
  ]],
  ["notifications", /^\/api\/notifications(?:\/(push|test|unsubscribe))?$/, [
    "action",
  ]],
  [
    "billing",
    /^\/api\/billing(?:\/(config|checkout|portal|webhook|preferences|history|cancel|sync|test-access))?$/,
    ["action"],
  ],
  ["tasks", /^\/api\/tasks\/dispatch$/, []],
  ["trips", /^\/api\/trips(?:\/(arrive|dismiss|primary))?$/, ["action"]],
  ["trips", /^\/api\/trips\/([^/]+)$/, ["id"]],
  ["attachments", /^\/api\/matches\/(\d+)\/attachments$/, ["id"]],
  ["eventchat", /^\/api\/events\/(\d+)\/messages$/, ["id"]],
  ["health", /^\/api\/health$/, []],
  ["stats", /^\/api\/stats$/, []],
  ["me", /^\/api\/me$/, []],
  ["discover", /^\/api\/discover$/, []],
  ["swipes", /^\/api\/swipes$/, []],
  ["messages", /^\/api\/matches\/(\d+)\/messages$/, ["id"]],
  ["matches", /^\/api\/matches(?:\/(\d+))?$/, ["id"]],
  ["photos", /^\/api\/photos(?:\/([^/]+)\/([^/]+))?$/, ["user", "file"]],
  ["events", /^\/api\/events(?:\/(\d+)(?:\/(rsvp))?)?$/, ["id", "action"]],
  ["safety", /^\/api\/(?:block|report)$/, []],
  [
    "today",
    /^\/api\/today(?:\/(badges|checkin|workouts|answer|goal|challenges|kudos)(?:\/([^/]+)(?:\/(leaderboard))?)?)?$/,
    ["section", "id", "sub"],
  ],
];

/** @param {string} pathname @returns {{handler:string,params:Record<string,string>}|null} */
export function resolveRoute(pathname) {
  const path = pathname.replace(/^\/(?:functions\/v1\/)?pacemate(?=\/|$)/, "");
  for (const [handler, pattern, names] of routes) {
    const match = path.match(pattern);
    if (match) {
      return {
        handler,
        params: Object.fromEntries(
          names.map((name, i) => [name, match[i + 1] || ""]),
        ),
      };
    }
  }
  return null;
}

export function allowedOrigin(origin, configured) {
  const origins = (configured ||
    "http://localhost:5173,http://127.0.0.1:5173,https://pacematess.netlify.app")
    .split(",").map((s) => s.trim());
  return !origin || origins.includes(origin);
}

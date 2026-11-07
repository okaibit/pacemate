import { resolveRoute, allowedOrigin } from "./routes.js";

const loaders = {
  chat: () => import("./handlers/chat.ts"),
  admin: () => import("./handlers/admin.ts"),
  settings: () => import("./handlers/settings.ts"),
  verification: () => import("./handlers/verification.ts"),
  export: () => import("./handlers/export.ts"),
  notifications: () => import("./handlers/notifications.ts"),
  billing: () => import("./handlers/billing.ts"),
  trips: () => import("./handlers/trips.ts"),
  tasks: () => import("./handlers/tasks.ts"),
  attachments: () => import("./handlers/attachments.ts"),
  eventchat: () => import("./handlers/eventchat.ts"),
  stats: () => import("./handlers/stats.ts"),
  me: () => import("./handlers/me.ts"),
  discover: () => import("./handlers/discover.ts"),
  swipes: () => import("./handlers/swipes.ts"),
  messages: () => import("./handlers/messages.ts"),
  matches: () => import("./handlers/matches.ts"),
  photos: () => import("./handlers/photos.ts"),
  events: () => import("./handlers/events.ts"),
  safety: () => import("./handlers/safety.ts"),
  today: () => import("./handlers/today.ts"),
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (!allowedOrigin(origin, Deno.env.get("PACEMATE_ALLOWED_ORIGINS"))) {
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  }
  const headers = {
    "Access-Control-Allow-Origin": origin || "http://localhost:5173",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin", "Cache-Control": "no-store",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    const route = resolveRoute(new URL(req.url).pathname);
    if (!route) return Response.json({ error: "Not found" }, { status: 404, headers });
    if (route.handler === "health") {
      const health = { status: "ok", version: "chat-5", databaseConfigured: !!Deno.env.get("PACEMATE_DATABASE_URL") };
      if (new URL(req.url).searchParams.get("database") === "1") {
        try {
          const { checkDatabase } = await import("./db/index.ts");
          return Response.json({ ...health, database: await checkDatabase() }, { headers });
        } catch (error) {
          const { databaseFailure } = await import("./db/runtime.js");
          const failure = databaseFailure(error);
          console.error("pacemate database probe failed", { code: failure.code });
          return Response.json({ ...health, status: "error", database: failure }, { status: 503, headers });
        }
      }
      return Response.json(health, { headers });
    }
    if (route.handler === "tasks") {
      const expected = Deno.env.get("PACEMATE_TASK_SECRET") || "";
      const provided = req.headers.get("x-task-secret") || "";
      if (expected.length < 32 || provided.length > 256 || !provided) return Response.json({error:"Unauthorized task request"},{status:401,headers});
      const hashes=await Promise.all([expected,provided].map(s=>crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
      let mismatch=0;const a=new Uint8Array(hashes[0]),b=new Uint8Array(hashes[1]);for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
      if(mismatch)return Response.json({error:"Unauthorized task request"},{status:401,headers});
    }
    const publicRequest = route.handler === "tasks" || (route.handler === "billing" && route.params.action === "webhook") || (route.handler === "notifications" && route.params.action === "unsubscribe") || route.handler === "stats" || (req.method === "GET" && ["events", "photos"].includes(route.handler));
    if (!publicRequest) {
      const { getUser } = await import("./server/supabase.ts");
      if (!await getUser(req)) return Response.json({ error: "Please log in." }, { status: 401, headers });
    }
    if (route.handler === "stats" && req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    const started = performance.now();
    console.info("pacemate handler loading", { handler: route.handler });
    const { default: handler } = await loaders[route.handler]();
    console.info("pacemate handler loaded", { handler: route.handler, elapsedMs: Math.round(performance.now() - started) });
    const response = await handler(req, { params: route.params });
    console.info("pacemate handler finished", { handler: route.handler, status: response.status, elapsedMs: Math.round(performance.now() - started) });
    const output = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers)) output.headers.set(name, value);
    return output;
  } catch (error) {
    console.error(error);
    return Response.json({ error: "The backend is unavailable. Please try again shortly." }, { status: 503, headers });
  }
});

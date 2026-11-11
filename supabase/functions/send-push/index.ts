import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import webpush from "npm:web-push@3.6.7";
const env = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
// Subscribe before reading presence; always remove the temporary server channel.
async function chatOpen(db: any, user: string, conversation: number) {
  const channel = db.channel(`push:${user}`, {
    config: { private: true, presence: { key: "server" } },
  });
  try {
    return await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 1500);
      channel.on("presence", { event: "sync" }, () => {
        clearTimeout(timeout);
        resolve(
          Object.values(channel.presenceState()).flat().some((p: any) =>
            p.conversation_id === conversation && p.visible === true
          ),
        );
      });
      channel.subscribe();
    });
  } finally {
    await db.removeChannel(channel);
  }
}
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const expected = env("PUSH_WEBHOOK_SECRET");
  if (req.headers.get("x-push-secret") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    const event = await req.json();
    if (
      event.type !== "INSERT" || event.schema !== "public" ||
      event.table !== "messages"
    ) return new Response("Ignored");
    const query = async (q: any) => {
      const { data, error } = await q;
      if (error) throw error;
      return data;
    };
    // Re-read trusted rows rather than trusting webhook contents.
    const msg = await query(
      db.from("messages").select(
        "id,conversation_id,sender_id,type,link_url,read_at,created_at",
      ).eq("id", event.record?.id).maybeSingle(),
    );
    if (
      !msg || msg.read_at || Date.now() - Date.parse(msg.created_at) > 3600000
    ) return new Response("Skipped");
    const chat = await query(
      db.from("conversations").select("*").eq("id", msg.conversation_id)
        .maybeSingle(),
    );
    if (!chat || ![chat.user_a, chat.user_b].includes(msg.sender_id)) {
      return new Response("Skipped");
    }
    const match = await query(
      db.from("matches").select("id,ended_at").eq("id", chat.id).maybeSingle(),
    );
    if (!match || match.ended_at) return new Response("Skipped");
    const recipient = chat.user_a === msg.sender_id ? chat.user_b : chat.user_a;
    const members = await query(
      db.from("profiles").select("id,name,suspended").in("id", [
        recipient,
        msg.sender_id,
      ]),
    );
    if (members.length !== 2 || members.some((p: any) => p.suspended)) {
      return new Response("Skipped");
    }
    const blocks = await query(
      db.from("blocks").select("blocker_id").or(
        `and(blocker_id.eq.${recipient},blocked_id.eq.${msg.sender_id}),and(blocker_id.eq.${msg.sender_id},blocked_id.eq.${recipient})`,
      ),
    );
    if (blocks.length) return new Response("Skipped");
    const mute = await query(
      db.from("conversation_members").select("muted_until").eq(
        "conversation_id",
        chat.id,
      ).eq("user_id", recipient).maybeSingle(),
    );
    const settings = await query(
      db.from("notification_settings").select("push_enabled").eq(
        "user_id",
        recipient,
      ).maybeSingle(),
    );
    if (!settings?.push_enabled) return new Response("Suppressed");
    if (
      mute?.muted_until && Date.parse(mute.muted_until) > Date.now() ||
      await chatOpen(db, recipient, chat.id)
    ) return new Response("Suppressed");
    const subscriptions = await query(
      db.from("push_subscriptions").select("*").eq("user_id", recipient),
    );
    webpush.setVapidDetails(
      env("VAPID_SUBJECT"),
      env("VAPID_PUBLIC_KEY"),
      env("VAPID_PRIVATE_KEY"),
    );
    const sender = members.find((p: any) => p.id === msg.sender_id);
    const payload = JSON.stringify({
      title: String(sender?.name || "New message").replace(/[\r\n]/g, " ")
        .slice(0, 60),
      body: msg.type === "link" || msg.link_url
        ? "Shared a link"
        : msg.type === "image"
        ? "Shared a photo"
        : "Sent a message",
      conversationId: chat.id,
      tag: `chat-${chat.id}`,
    });
    let failed = false;
    // Endpoint allowlist prevents stored subscription URLs being used for SSRF.
    await Promise.all(subscriptions.map(async (s: any) => {
      const url = new URL(s.endpoint);
      if (
        url.protocol !== "https:" ||
        !(url.hostname === "fcm.googleapis.com" ||
          url.hostname === "updates.push.services.mozilla.com" ||
          url.hostname.endsWith(".push.apple.com") ||
          url.hostname === "web.push.apple.com" ||
          url.hostname.endsWith(".notify.windows.com"))
      ) return;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 3600, timeout: 10000 },
        );
      } catch (e) {
        if ([404, 410].includes(e.statusCode)) {
          await query(db.from("push_subscriptions").delete().eq("id", s.id));
        } else failed = true;
      }
    }));
    return new Response(failed ? "Delivery incomplete" : "OK", {
      status: failed ? 502 : 200,
    });
  } catch {
    return new Response("Push delivery failed", { status: 500 });
  }
});

import {
  body,
  handle,
  HttpError,
  json,
  publicProfile,
} from "../server/http.ts";
import {
  camel,
  lockActiveMatch,
  rateLimit,
  requireMatch,
  rows,
  transaction,
} from "../server/feature-db.ts";
import { signedPhoto } from "../server/supabase.ts";
import { repliesEnabled, replyQuotes } from "../server/chat-replies.ts";
import { fetchPreview } from "../server/link-preview.js";
export default handle(async (req, ctx) => {
  const id = Number(ctx.params.id),
    { user, match } = await requireMatch(req, id);
  if (req.method === "GET") {
    const replyParam = new URL(req.url).searchParams.get("replies");
    if (replyParam !== null) {
      const ids = replyParam.split(",").map(Number).filter((n) =>
        Number.isSafeInteger(n) && n > 0
      ).slice(0, 100);
      return json({ replies: await replyQuotes(id, ids) });
    }
    const imageParam = new URL(req.url).searchParams.get("images");
    if (imageParam !== null) {
      const ids = imageParam.split(",").map(Number).filter((n) =>
          Number.isSafeInteger(n) && n > 0
        ).slice(0, 100),
        images: Record<string, string> = {};
      if (ids.length) {
        const attachments = await rows(
          `SELECT m.id,a.object_key FROM public.messages m JOIN public.chat_attachments a ON a.id=m.attachment_id WHERE m.match_id=$1 AND m.id=ANY($2::int[])`,
          [id, "{" + ids.join(",") + "}"],
        );
        for (let i = 0; i < attachments.length; i += 5) {
          await Promise.all(
            attachments.slice(i, i + 5).map(async (a) => {
              images[a.id] = await signedPhoto("chat", a.object_key);
            }),
          );
        }
      }
      return json({ images });
    }
    const [p] = await rows("SELECT * FROM public.profiles WHERE id=$1", [
      match.other_id,
    ]);
    return json({
      other: publicProfile(camel(p)),
      repliesEnabled: await repliesEnabled(),
      archived: !!match.ended_at,
      intention: match.intention ?? null,
      legacy: match.intention == null,
    });
  }
  if (req.method === "POST") {
    await requireMatch(req, id, "write");
    const b = await body(req);
    if (b.action === "reaction") {
      const messageId = Number(b.messageId), emoji = String(b.emoji || "");
      if (
        !Number.isSafeInteger(messageId) || messageId < 1 ||
        !["👍", "❤️", "😂", "👏"].includes(emoji)
      ) throw new HttpError(422, "Choose a valid reaction.");
      await transaction(async (tx) => {
        await lockActiveMatch(tx, match, id, user.id);
        const [message] = await tx.unsafe(
          "SELECT id FROM public.messages WHERE id=$1 AND conversation_id=$2",
          [messageId, id],
        );
        if (!message) throw new HttpError(404, "Message not found.");
        const [existing] = await tx.unsafe(
          "SELECT emoji FROM public.message_reactions WHERE message_id=$1 AND user_id=$2",
          [messageId, user.id],
        );
        if (existing) {
          await tx.unsafe(
            "DELETE FROM public.message_reactions WHERE message_id=$1 AND user_id=$2",
            [messageId, user.id],
          );
        } else {
          await tx.unsafe(
            "INSERT INTO public.message_reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=excluded.emoji",
            [messageId, user.id, emoji],
          );
        }
      });
      return json({ ok: true });
    }
    if (b.action === "mute") {
      const muted = !!b.muted;
      await transaction(async (tx) => {
        await lockActiveMatch(tx, match, id, user.id);
        await tx.unsafe(
          `INSERT INTO public.conversation_members(conversation_id,user_id,muted_until) VALUES($1,$2,$3)
    ON CONFLICT(conversation_id,user_id) DO UPDATE SET muted_until=excluded.muted_until`,
          [id, user.id, muted ? "9999-12-31T00:00:00Z" : null],
        );
      });
      return json({ muted });
    }
    const messageId = Number(b.messageId);
    if (!Number.isSafeInteger(messageId) || messageId < 1) {
      throw new HttpError(422, "Invalid message.");
    }
    const [message] = await rows(
      "SELECT * FROM public.messages WHERE id=$1 AND match_id=$2 AND sender_id=$3",
      [messageId, id, user.id],
    );
    if (!message) throw new HttpError(404, "Message not found.");
    if (message.link_url && !message.link_meta) {
      // Opt-in because metadata retrieval discloses the shared URL to a provider.
      if (Deno.env.get("PACEMATE_LINK_PREVIEWS") === "true") {
        await rateLimit(user.id, "link-preview", 10);
        let metadata = null;
        try {
          metadata = await fetchPreview(message.link_url);
        } catch {}
        if (metadata) {
          const [updated] = await transaction(async (tx) => {
            await lockActiveMatch(tx, match, id, user.id);
            return await tx.unsafe(
              "UPDATE public.messages SET link_meta=$1::jsonb WHERE id=$2 AND match_id=$3 AND sender_id=$4 RETURNING *",
              [JSON.stringify(metadata), messageId, id, user.id],
            );
          });
          return json({ message: updated });
        }
      }
    }
    return json({ message });
  }
  throw new HttpError(405, "Method not allowed");
});

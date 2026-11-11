import { handle, HttpError, json } from "../server/http.ts";
import {
  lockActiveMatch,
  rateLimit,
  requireMatch,
  transaction,
} from "../server/feature-db.ts";
import { deletePrivate, readImage, uploadPrivate } from "../server/supabase.ts";
export default handle(async (req, ctx) => {
  const matchId = Number(ctx.params.id),
    { user, match } = await requireMatch(req, matchId, "write");
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  await rateLimit(user.id, "attachment", 30, 86400);
  let image;
  try {
    image = await readImage(req);
  } catch {
    throw new HttpError(422, "Choose a JPEG, PNG or WebP under 2 MB.");
  }
  const key = `${user.id}/${crypto.randomUUID()}.${image.ext}`;
  await uploadPrivate("chat", key, image.data, image.type);
  try {
    const [a] = await transaction(async (tx) => {
      await lockActiveMatch(tx, match, matchId, user.id);
      return await tx.unsafe(
        "INSERT INTO public.chat_attachments(user_id,match_id,object_key) VALUES($1,$2,$3) RETURNING id",
        [user.id, matchId, key],
      );
    });
    return json({ attachmentId: a.id }, 201);
  } catch (error) {
    await deletePrivate("chat", [key]);
    throw error;
  }
});

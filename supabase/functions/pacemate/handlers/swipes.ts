import { camel, rateLimit, transaction } from "../server/feature-db.ts";
import { queueSocialPush } from "../server/push-delivery.ts";
import { eligibilitySQL } from "../server/foundation.ts";
import {
  body,
  handle,
  HttpError,
  json,
  pairOf,
  publicProfile,
  requireProfile,
} from "../server/http.ts";

export default handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const { profile: me } = await requireProfile(req);
  await rateLimit(me.id, "swipe", 120);
  const { targetId, liked, intention } = await body(req);
  if (typeof liked !== "boolean") {
    throw new HttpError(422, "Choose like or pass.");
  }
  if (!["play", "friend", "date"].includes(intention)) {
    throw new HttpError(422, "Choose a connection intention.");
  }
  const mode = intention === "play"
    ? "training_partner"
    : intention === "friend"
    ? "friendship"
    : "dating";
  if (typeof targetId !== "string" || targetId === me.id) {
    throw new HttpError(422, "Invalid member.");
  }
  const [userA, userB] = pairOf(me.id, targetId);
  const response = await transaction(async (tx) => {
    // Share the pair lock with unmatch, block and message writes, then take the
    // intention lock. This serializes safety transitions against match creation.
    await tx.unsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      userA + ":" + userB,
    ]);
    await tx.unsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      userA + ":" + userB + ":" + intention,
    ]);
    // Stabilize both preferences while authorizing and creating the connection.
    await tx.unsafe(
      "SELECT id FROM public.profiles WHERE id IN($1,$2) ORDER BY id FOR UPDATE",
      [userA, userB],
    );
    const [target] = await tx.unsafe(
      `SELECT p.* FROM public.profiles p JOIN public.profiles v ON v.id=$1 WHERE p.id=$2 AND $3=ANY(p.connection_modes) AND $3=ANY(v.connection_modes) AND (${
        eligibilitySQL(intention)
      })`,
      [me.id, targetId, mode],
    );
    if (!target) {
      throw new HttpError(404, "That member is no longer available.");
    }
    const [swipe] = await tx.unsafe(
      `INSERT INTO public.swipes(swiper_id,target_id,intention,liked,acted_at) VALUES($1,$2,$3,$4,clock_timestamp())
    ON CONFLICT(swiper_id,target_id,intention) WHERE intention IS NOT NULL DO UPDATE SET liked=excluded.liked,acted_at=clock_timestamp() RETURNING acted_at`,
      [me.id, targetId, intention, liked],
    );
    if (!liked) return json({ match: null });
    const [back] = await tx.unsafe(
      `SELECT s.acted_at FROM public.swipes s WHERE s.swiper_id=$1 AND s.target_id=$2 AND s.intention=$3 AND s.liked`,
      [targetId, me.id, intention],
    );
    if (!back) return json({ match: null });
    const [closure] = await tx.unsafe(
      `SELECT max(ended_at) AS ended_at FROM public.matches WHERE user_a=$1 AND user_b=$2 AND intention=$3`,
      [userA, userB, intention],
    );
    if (
      closure?.ended_at &&
      (!(new Date(swipe.acted_at) > new Date(closure.ended_at)) ||
        !(new Date(back.acted_at) > new Date(closure.ended_at)))
    ) return json({ match: null });
    const [existing] = await tx.unsafe(
      "SELECT id FROM public.matches WHERE user_a=$1 AND user_b=$2 AND intention=$3 AND ended_at IS NULL",
      [userA, userB, intention],
    );
    if (existing) {
      return json({
        match: {
          id: existing.id,
          intention,
          other: publicProfile(camel(target)),
        },
      });
    }
    const [match] = await tx.unsafe(
      "INSERT INTO public.matches(user_a,user_b,intention) VALUES($1,$2,$3) ON CONFLICT(user_a,user_b,intention) WHERE intention IS NOT NULL AND ended_at IS NULL DO NOTHING RETURNING id",
      [userA, userB, intention],
    );
    const [created] = match ? [match] : await tx.unsafe(
      "SELECT id FROM public.matches WHERE user_a=$1 AND user_b=$2 AND intention=$3 AND ended_at IS NULL",
      [userA, userB, intention],
    );
    return json({
      match: { id: created.id, intention, other: publicProfile(camel(target)) },
    });
  });
  if (liked) {
    const result = await response.clone().json();
    if (result.match) {
      queueSocialPush(`match:${result.match.id}:${userA}`);
      queueSocialPush(`match:${result.match.id}:${userB}`);
    }
  }
  return response;
});

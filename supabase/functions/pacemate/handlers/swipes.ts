import {rateLimit} from "../server/feature-db.ts";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { profiles, swipes, matches, blocks } from "../db/schema.ts";
import { handle, json, requireProfile, body, HttpError, pairOf, publicProfile } from "../server/http.ts";

export default handle(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { profile: me } = await requireProfile(req);
  await rateLimit(me.id,"swipe",120);
  const { targetId, liked } = await body(req);
  if(typeof liked!=="boolean")throw new HttpError(422,"Choose like or pass.");
  if (typeof targetId !== "string" || targetId === me.id) throw new HttpError(422, "Invalid member.");
  const [target] = await db.select().from(profiles).where(eq(profiles.id, targetId));
  if (!target || target.paused || target.suspended) throw new HttpError(404, "That member is no longer available.");

  const [userA, userB] = pairOf(me.id, targetId);
  return await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userA + ":" + userB}, 0))`);
    const [blocked] = await tx.select().from(blocks).where(or(
      and(eq(blocks.blockerId, me.id), eq(blocks.blockedId, targetId)),
      and(eq(blocks.blockerId, targetId), eq(blocks.blockedId, me.id)),
    ));
    if (blocked) throw new HttpError(404, "That member is no longer available.");
    await tx.insert(swipes).values({ swiperId: me.id, targetId, liked: !!liked })
      .onConflictDoUpdate({ target: [swipes.swiperId, swipes.targetId], set: { liked: !!liked } });
    if (!liked) return json({ match: null });
    const [back] = await tx.select().from(swipes)
      .where(and(eq(swipes.swiperId, targetId), eq(swipes.targetId, me.id), eq(swipes.liked, true)));
    if (!back) return json({ match: null });
    await tx.insert(matches).values({ userA, userB }).onConflictDoNothing();
    const [m] = await tx.select().from(matches).where(and(eq(matches.userA, userA), eq(matches.userB, userB)));
    return json({ match: { id: m.id, other: publicProfile(target) } });
  });
});

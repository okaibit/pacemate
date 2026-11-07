import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { blocks, reports, matches, profiles } from "../db/schema.ts";
import { handle, json, requireProfile, body, str, pick, HttpError, pairOf } from "../server/http.ts";
import { REPORT_REASONS } from "../server/options.ts";

// POST /api/block   { userId }                      -> hides both members from each other and ends any match
// POST /api/report  { userId, reason, details }     -> records a report for review and also blocks
export default handle(async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { profile: me } = await requireProfile(req);
  const b = await body(req);
  const userId = typeof b.userId === "string" ? b.userId : "";
  if (!userId || userId === me.id) throw new HttpError(422, "Invalid member.");
  const [target] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId));
  if (!target) throw new HttpError(404, "Member not found.");

  const [a, c] = pairOf(me.id, userId);
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${a + ":" + c}, 0))`);
    if (new URL(req.url).pathname.endsWith("/report")) {
      await tx.insert(reports).values({
        reporterId: me.id, reportedId: userId,
        reason: pick(b.reason, REPORT_REASONS, "reason", true) as string,
        details: str(b.details, 1000, "Details"),
      });
    }
    await tx.insert(blocks).values({ blockerId: me.id, blockedId: userId }).onConflictDoNothing();
    await tx.execute(sql`UPDATE swipes SET liked=false WHERE (swiper_id=${a} AND target_id=${c}) OR (swiper_id=${c} AND target_id=${a})`);
    await tx.delete(matches).where(and(eq(matches.userA, a), eq(matches.userB, c)));
  });
  return json({ ok: true });
});


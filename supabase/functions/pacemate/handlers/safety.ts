import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { blocks, profiles, reports } from "../db/schema.ts";
import {
  body,
  handle,
  HttpError,
  json,
  pairOf,
  pick,
  requireProfile,
  str,
} from "../server/http.ts";
import { REPORT_REASONS } from "../server/options.ts";

// POST /api/block   { userId }                      -> hides both members from each other and ends any match
// POST /api/report  { userId, reason, details }     -> records a report for review and also blocks
export default handle(async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { profile: me } = await requireProfile(req);
  const b = await body(req);
  const userId = typeof b.userId === "string" ? b.userId : "";
  if (!userId || userId === me.id) throw new HttpError(422, "Invalid member.");
  const [target] = await db.select({ id: profiles.id }).from(profiles).where(
    eq(profiles.id, userId),
  );
  if (!target) throw new HttpError(404, "Member not found.");

  const [a, c] = pairOf(me.id, userId);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${a + ":" + c}, 0))`,
    );
    if (new URL(req.url).pathname.endsWith("/report")) {
      await tx.insert(reports).values({
        reporterId: me.id,
        reportedId: userId,
        reason: pick(b.reason, REPORT_REASONS, "reason", true) as string,
        details: str(b.details, 1000, "Details"),
      });
    }
    await tx.insert(blocks).values({ blockerId: me.id, blockedId: userId })
      .onConflictDoNothing();
    // Keep swipe history intact. The global block prevents discovery and matching;
    // ended_at prevents stale likes from reopening a connection after unblock.
    await tx.execute(
      sql`UPDATE public.matches SET ended_at=coalesce(ended_at,clock_timestamp()),ended_reason=coalesce(ended_reason,'blocked') WHERE user_a=${a} AND user_b=${c} AND ended_at IS NULL`,
    );
  });
  return json({ ok: true });
});

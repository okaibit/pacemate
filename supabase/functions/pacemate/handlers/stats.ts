import { withDatabaseDeadline } from "../db/index.ts";
import { databaseFailure } from "../db/runtime.js";

// Fixed SQL only: no client-provided values are interpolated. One round trip
// avoids the ORM/parallel-query path while checking real application tables.
const STATS_QUERY = `
  SELECT
    (SELECT count(*)::int FROM public.profiles) AS members,
    (SELECT count(*)::int FROM public.matches) AS matches,
    (SELECT count(*)::int FROM public.events WHERE cancelled_at IS NULL AND(weekly OR starts_at>now()-interval '2 hours')) AS events,
    coalesce((
      SELECT json_agg(c) FROM (
        SELECT current_city AS city, count(*)::int AS n
        FROM public.profiles
        GROUP BY current_city ORDER BY count(*) DESC LIMIT 12
      ) c
    ), '[]'::json) AS cities`;

export default async () => {
  try {
    console.info("pacemate stats direct query starting");
    const [row] = await withDatabaseDeadline(client => client.unsafe(STATS_QUERY));
    if (!row) throw new Error("No stats result returned");
    console.info("pacemate stats direct query finished");
    const cities = typeof row.cities === "string" ? JSON.parse(row.cities) : row.cities;
    return Response.json({
      members: Number(row.members), matches: Number(row.matches), events: Number(row.events), cities: cities || [],
    }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (err) {
    const failure = databaseFailure(err);
    console.error("pacemate stats failed", { code: failure.code });
    return Response.json(failure, { status: 503 });
  }
};

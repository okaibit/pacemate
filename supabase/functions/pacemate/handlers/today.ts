import { and, eq, sql, desc, inArray } from "drizzle-orm";
import { db } from "../db/index.ts";
import {rows} from "../server/feature-db.ts";
import { profiles, checkins, workouts, dailyAnswers, challengeMembers, kudos } from "../db/schema.ts";
import { handle, json, requireProfile, body, str, pick, HttpError } from "../server/http.ts";
import { AREA_KEYS, SPORTS, CHALLENGES, questionFor } from "../server/options.ts";

// The daily home screen: check-in across areas of life, workout log, streaks, weekly goal,
// question of the day, monthly challenges with leaderboards, and kudos on matches' workouts.

const rowsOf = (r: any): any[] => r?.rows ?? r ?? [];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => iso(new Date(Date.parse(day + "T00:00:00Z") + n * 86400000));

/** The member's local calendar day. Must be within a day or two of UTC so nobody can backfill a streak. */
function dayParam(v: unknown) {
  const now=iso(new Date());if(v===null||v===undefined||v==='')return now;
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new HttpError(422,'Enter a valid date.');
  const parsed=new Date(v+'T00:00:00Z');
  if(isNaN(+parsed)||iso(parsed)!==v)throw new HttpError(422,'Enter a valid date.');
  if(v<addDays(now,-1)||v>addDays(now,1))throw new HttpError(422,'This check-in date has expired. Refresh Today.');
  return v;
}

/** Progress for every challenge metric, for the given members in a YYYY-MM month. */
async function progress(month: string, ids: string[]) {
  if (!ids.length) return new Map<string, Record<string, number>>();
  const start = `${month}-01`;
  const inMonth = (col: string) => sql.raw(`${col} >= '${start}'::date AND ${col} < ('${start}'::date + interval '1 month')`);
  const idList = sql`ARRAY[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::text[]`;
  const res = await db.execute(sql`
    SELECT u.id,
      (SELECT count(*) FROM (
        SELECT c.day FROM checkins c WHERE c.user_id = u.id AND 'Move' = ANY(c.areas) AND ${inMonth("c.day")}
        UNION SELECT w.day FROM workouts w WHERE w.user_id = u.id AND ${inMonth("w.day")}) x)::int AS "activeDays",
      (SELECT coalesce(sum(w.minutes), 0) FROM workouts w WHERE w.user_id = u.id AND ${inMonth("w.day")})::int AS "minutes",
      (SELECT coalesce(sum(w.distance_km), 0) FROM workouts w WHERE w.user_id = u.id AND ${inMonth("w.day")})::float AS "distance",
      (SELECT count(*) FILTER (WHERE 'Sleep' = ANY(c.areas) OR c.sleep_hours >= 7) FROM checkins c WHERE c.user_id = u.id AND ${inMonth("c.day")})::int AS "area:Sleep",
      (SELECT count(*) FILTER (WHERE 'Mind' = ANY(c.areas)) FROM checkins c WHERE c.user_id = u.id AND ${inMonth("c.day")})::int AS "area:Mind",
      (SELECT count(*) FILTER (WHERE 'Fuel' = ANY(c.areas) AND 'Hydrate' = ANY(c.areas)) FROM checkins c WHERE c.user_id = u.id AND ${inMonth("c.day")})::int AS "area:Fuel",
      (SELECT count(*) FILTER (WHERE 'Connect' = ANY(c.areas)) FROM checkins c WHERE c.user_id = u.id AND ${inMonth("c.day")})::int AS "area:Connect",
      (SELECT count(*) FILTER (WHERE cardinality(c.areas) >= 5) FROM checkins c WHERE c.user_id = u.id AND ${inMonth("c.day")})::int AS "balanced"
    FROM unnest(${idList}) AS u(id)`);
  return new Map(rowsOf(res).map((r: any) => [r.id, r]));
}

async function streaks(userId: string, today: string) {
  const res = await db.execute(sql`
    SELECT DISTINCT to_char(day, 'YYYY-MM-DD') AS day FROM (
      SELECT day FROM checkins WHERE user_id = ${userId} AND cardinality(areas) > 0 AND day > ${today}::date - 400
      UNION SELECT day FROM workouts WHERE user_id = ${userId} AND day > ${today}::date - 400) x`);
  const days = new Set(rowsOf(res).map((r: any) => r.day as string));
  // A streak stays alive until the end of today, so start from yesterday if today is not logged yet.
  let d = days.has(today) ? today : addDays(today, -1), current = 0;
  while (days.has(d)) { current++; d = addDays(d, -1); }
  let best = 0, run = 0;
  [...days].sort().forEach((x, i, arr) => { run = i && addDays(arr[i - 1], 1) === x ? run + 1 : 1; best = Math.max(best, run); });
  return { current, best, loggedToday: days.has(today) };
}

async function badges(meId: string) {
  const [r] = await rows(`
    SELECT
      (SELECT count(*) FROM public.messages m JOIN public.matches x ON x.id=m.match_id
        WHERE (x.user_a=$1 OR x.user_b=$1) AND m.sender_id<>$1 AND m.read_at IS NULL)::int AS unread,
      (SELECT count(*) FROM public.swipes s JOIN public.profiles p ON p.id=s.swiper_id
        WHERE s.target_id=$1 AND s.swiper_id<>$1 AND s.liked AND NOT p.paused AND NOT p.suspended
        AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=s.swiper_id) OR (b.blocker_id=s.swiper_id AND b.blocked_id=$1)))::int AS "likesYou"`,[meId]);
  return {unread:r?.unread??0,likesYou:r?.likesYou??0};
}

const matchIdsOf = (meId: string) => sql`(SELECT CASE WHEN user_a = ${meId} THEN user_b ELSE user_a END FROM matches WHERE user_a = ${meId} OR user_b = ${meId})`;

export default handle(async (req, ctx) => {
  const { profile: me } = await requireProfile(req);
  const url = new URL(req.url);
  const [section, id, sub] = [ctx.params?.section || "", ctx.params?.id || "", ctx.params?.sub || ""];

  if (req.method === "GET" && section === "badges") return json(await badges(me.id));

  if (req.method === "GET" && section === "challenges" && sub === "leaderboard") {
    const ch = CHALLENGES.find((c) => c.id === id);
    if (!ch) throw new HttpError(404, "Challenge not found.");
    const month = dayParam(url.searchParams.get("day")).slice(0, 7);
    const cityOnly = url.searchParams.get("scope") === "city";
    const metrics: Record<string,string> = {
      activeDays: `(SELECT count(*) FROM(SELECT day FROM public.checkins WHERE user_id=p.id AND 'Move'=ANY(areas) AND day>=r.start AND day<r.finish UNION SELECT day FROM public.workouts WHERE user_id=p.id AND day>=r.start AND day<r.finish)a)`,
      minutes: `(SELECT coalesce(sum(minutes),0) FROM public.workouts WHERE user_id=p.id AND day>=r.start AND day<r.finish)`,
      distance: `(SELECT coalesce(sum(distance_km),0) FROM public.workouts WHERE user_id=p.id AND day>=r.start AND day<r.finish)`,
      'area:Sleep': `(SELECT count(*) FROM public.checkins WHERE user_id=p.id AND day>=r.start AND day<r.finish AND('Sleep'=ANY(areas) OR sleep_hours>=7))`,
      'area:Mind': `(SELECT count(*) FROM public.checkins WHERE user_id=p.id AND day>=r.start AND day<r.finish AND 'Mind'=ANY(areas))`,
      'area:Fuel': `(SELECT count(*) FROM public.checkins WHERE user_id=p.id AND day>=r.start AND day<r.finish AND 'Fuel'=ANY(areas) AND 'Hydrate'=ANY(areas))`,
      'area:Connect': `(SELECT count(*) FROM public.checkins WHERE user_id=p.id AND day>=r.start AND day<r.finish AND 'Connect'=ANY(areas))`,
      balanced: `(SELECT count(*) FROM public.checkins WHERE user_id=p.id AND day>=r.start AND day<r.finish AND cardinality(areas)>=5)`,
    };
    const { rows } = await import('../server/feature-db.ts');
    const [board]=await rows(`WITH period_bounds AS(SELECT $2::date AS start,($2::date+interval '1 month')::date AS finish),
      scores AS(SELECT p.id,p.name,p.photos[1] AS photo,p.current_city AS city,(${metrics[ch.metric]})::float8 AS value
        FROM public.challenge_members c JOIN public.profiles p ON p.id=c.user_id CROSS JOIN period_bounds r
        WHERE c.month=to_char($2::date,'YYYY-MM') AND c.challenge_id=$3 AND NOT p.suspended
        AND(NOT $4 OR lower(p.current_city)=lower($5))
        AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE(b.blocker_id=$1 AND b.blocked_id=p.id)OR(b.blocker_id=p.id AND b.blocked_id=$1))),
      ranked AS(SELECT *,row_number() OVER(ORDER BY value DESC,id) AS rank FROM scores)
      SELECT (SELECT count(*)::int FROM ranked) AS total,coalesce((SELECT rank FROM ranked WHERE id=$1),0)::int AS "myRank",
        coalesce((SELECT json_agg(json_build_object('id',id,'name',name,'photos',CASE WHEN photo IS NULL THEN '[]'::json ELSE json_build_array(photo) END,'city',city,'value',value,'me',id=$1) ORDER BY rank) FROM ranked WHERE rank<=20),'[]'::json) AS leaders`,[me.id,month+'-01',ch.id,cityOnly,me.currentCity]);
    return json({challenge:ch,...board});
  }

  if (req.method === "GET") {
    const today = dayParam(url.searchParams.get("day"));
    const month = today.slice(0, 7);
    // Week runs Monday to Sunday.
    const dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
    const weekStart = addDays(today, -dow);

    await db.update(profiles).set({ lastActiveAt: sql`now()` }).where(eq(profiles.id, me.id));
    const [[checkin], [answer], todays, weekRes, joined, s, b, feedRes] = await Promise.all([
      db.select().from(checkins).where(and(eq(checkins.userId, me.id), eq(checkins.day, today))),
      db.select().from(dailyAnswers).where(and(eq(dailyAnswers.userId, me.id), eq(dailyAnswers.day, today))),
      db.select().from(workouts).where(and(eq(workouts.userId, me.id), eq(workouts.day, today))).orderBy(desc(workouts.id)),
      db.execute(sql`
        SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
          (SELECT coalesce(sum(minutes), 0) FROM workouts w WHERE w.user_id = ${me.id} AND w.day = d::date)::int AS minutes,
          (SELECT coalesce(sum(distance_km), 0) FROM workouts w WHERE w.user_id = ${me.id} AND w.day = d::date)::float AS distance,
          (SELECT count(*) FROM workouts w WHERE w.user_id = ${me.id} AND w.day = d::date)::int AS sessions,
          coalesce((SELECT areas FROM checkins c WHERE c.user_id = ${me.id} AND c.day = d::date), '{}'::text[]) AS areas
        FROM generate_series(${weekStart}::date, ${weekStart}::date + 6, interval '1 day') d`),
      db.select({ id: challengeMembers.challengeId }).from(challengeMembers)
        .where(and(eq(challengeMembers.userId, me.id), eq(challengeMembers.month, month))),
      streaks(me.id, today),
      badges(me.id),
      db.execute(sql`
        SELECT w.id, w.sport, w.minutes, w.distance_km AS "distanceKm", w.note, to_char(w.day, 'YYYY-MM-DD') AS day, w.created_at AS "createdAt",
          p.id AS "userId", p.name, p.photos[1] AS photo,
          (SELECT count(*) FROM kudos k WHERE k.workout_id = w.id)::int AS kudos,
          EXISTS (SELECT 1 FROM kudos k WHERE k.workout_id = w.id AND k.user_id = ${me.id}) AS "gave"
        FROM workouts w JOIN profiles p ON p.id = w.user_id
        WHERE w.user_id IN ${matchIdsOf(me.id)} AND w.day >= ${today}::date - 7
        ORDER BY w.created_at DESC LIMIT 20`),
    ]);
    const week = rowsOf(weekRes).map((d: any) => ({ ...d, active: d.sessions > 0 || (d.areas || []).includes("Move") }));
    const prog = (await progress(month, [me.id])).get(me.id) || {};
    const mine = new Set(joined.map((j) => j.id));
    const myKudos = await db.execute(sql`
      SELECT count(*)::int AS n FROM kudos k JOIN workouts w ON w.id = k.workout_id WHERE w.user_id = ${me.id} AND w.day >= ${today}::date - 7`);

    return json({
      day: today,
      question: questionFor(today),
      answer: answer?.answer || "",
      checkin: checkin ? { areas: checkin.areas, mood: checkin.mood, sleepHours: checkin.sleepHours, note: checkin.note } : null,
      workouts: todays,
      streak: s,
      week: {
        start: weekStart, days: week, goal: me.weeklyGoal,
        activeDays: week.filter((d: any) => d.active).length,
        minutes: week.reduce((n: number, d: any) => n + d.minutes, 0),
        distance: Math.round(week.reduce((n: number, d: any) => n + d.distance, 0) * 10) / 10,
      },
      challenges: CHALLENGES.map((c) => ({ ...c, joined: mine.has(c.id), value: Number(prog[c.metric] || 0) })),
      badges: b,
      kudosReceived: rowsOf(myKudos)[0]?.n ?? 0,
      feed: rowsOf(feedRes),
    });
  }

  const needsBody=req.method!=='DELETE'&&['checkin','workouts','answer','goal','challenges'].includes(section);
  const b = needsBody?await body(req):{};

  if (req.method === "PUT" && section === "checkin") {
    const day = dayParam(b.day);
    const areas = Array.isArray(b.areas) ? [...new Set(b.areas.filter((a: string) => AREA_KEYS.includes(a)))] as string[] : [];
    const mood = b.mood === null || b.mood === undefined || b.mood === "" ? null : Math.max(1, Math.min(5, parseInt(b.mood) || 3));
    const sleep = b.sleepHours === null || b.sleepHours === undefined || b.sleepHours === "" ? null : Math.max(0, Math.min(16, Number(b.sleepHours) || 0));
    const values = { userId: me.id, day, areas, mood, sleepHours: sleep, note: str(b.note, 280, "Note") };
    await db.insert(checkins).values(values)
      .onConflictDoUpdate({ target: [checkins.userId, checkins.day], set: { areas, mood, sleepHours: sleep, note: values.note, updatedAt: sql`now()` } });
    return json({ ok: true });
  }

  if (req.method === "POST" && section === "workouts") {
    const minutes = parseInt(b.minutes);
    if (!minutes || minutes < 1 || minutes > 600) throw new HttpError(422, "Enter between 1 and 600 minutes.");
    const km = b.distanceKm === "" || b.distanceKm === null || b.distanceKm === undefined ? null : Number(b.distanceKm);
    if (km !== null && (isNaN(km) || km < 0 || km > 500)) throw new HttpError(422, "Enter a distance between 0 and 500 km.");
    const [w] = await db.insert(workouts).values({
      userId: me.id, day: dayParam(b.day), sport: pick(b.sport, SPORTS, "sport", true) as string,
      minutes, distanceKm: km, note: str(b.note, 200, "Note"),
    }).returning();
    return json({ workout: w }, 201);
  }

  if (req.method === "DELETE" && section === "workouts") {
    const [w] = await db.delete(workouts).where(and(eq(workouts.id, parseInt(id) || 0), eq(workouts.userId, me.id))).returning();
    if (!w) throw new HttpError(404, "Workout not found.");
    return json({ ok: true });
  }

  if (req.method === "PUT" && section === "answer") {
    const day = dayParam(b.day);
    const answer = str(b.answer, 200, "Answer");
    if (!answer) {
      await db.delete(dailyAnswers).where(and(eq(dailyAnswers.userId, me.id), eq(dailyAnswers.day, day)));
      return json({ ok: true });
    }
    await db.insert(dailyAnswers).values({ userId: me.id, day, question: questionFor(day), answer })
      .onConflictDoUpdate({ target: [dailyAnswers.userId, dailyAnswers.day], set: { answer, question: questionFor(day) } });
    return json({ ok: true });
  }

  if (req.method === "PUT" && section === "goal") {
    const goal = Math.max(1, Math.min(7, parseInt(b.weeklyGoal) || 4));
    await db.update(profiles).set({ weeklyGoal: goal }).where(eq(profiles.id, me.id));
    return json({ weeklyGoal: goal });
  }

  if (req.method === "POST" && section === "challenges") {
    const ch = CHALLENGES.find((c) => c.id === id);
    if (!ch) throw new HttpError(404, "Challenge not found.");
    const month = dayParam(b.day).slice(0, 7);
    const where = and(eq(challengeMembers.userId, me.id), eq(challengeMembers.month, month), eq(challengeMembers.challengeId, ch.id));
    const [existing] = await db.select().from(challengeMembers).where(where);
    if (existing) { await db.delete(challengeMembers).where(where); return json({ joined: false }); }
    await db.insert(challengeMembers).values({ userId: me.id, month, challengeId: ch.id }).onConflictDoNothing();
    return json({ joined: true });
  }

  if (req.method === "POST" && section === "kudos") {
    const wid = parseInt(id) || 0;
    // Kudos only for workouts logged by your matches.
    const [w] = await db.select({ id: workouts.id }).from(workouts)
      .where(and(eq(workouts.id, wid), sql`${workouts.userId} IN ${matchIdsOf(me.id)}`));
    if (!w) throw new HttpError(404, "Workout not found.");
    const where = and(eq(kudos.workoutId, wid), eq(kudos.userId, me.id));
    const [existing] = await db.select().from(kudos).where(where);
    if (existing) { await db.delete(kudos).where(where); return json({ gave: false }); }
    await db.insert(kudos).values({ workoutId: wid, userId: me.id }).onConflictDoNothing();
    return json({ gave: true });
  }

  return json({ error: "Not found" }, 404);
});


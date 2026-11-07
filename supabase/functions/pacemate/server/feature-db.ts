import { withDatabaseDeadline } from "../db/index.ts";
import { requireProfile, HttpError } from "./http.ts";

export const rows = (query: string, params: any[] = []) => withDatabaseDeadline(client => client.unsafe(query, params));
export const transaction = (fn: (tx: any) => Promise<any>) => withDatabaseDeadline(client => client.begin(fn));
export const arrayParam = (values: string[]) => '{' + values.map(v => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
export const camel = (row: any): any => row && Object.fromEntries(Object.entries(row).map(([key,value]) => [key.replace(/_([a-z])/g, (_m,c) => c.toUpperCase()),value]));
export async function requireAdmin(req: Request) {
  const { user, profile } = await requireProfile(req);
  if (!(await rows('SELECT 1 FROM public.app_admins WHERE user_id=$1',[user.id])).length) throw new HttpError(403,"Administrator access required.");
  return { user, profile };
}
export async function requireMatch(req: Request, id: number) {
  const { user, profile } = await requireProfile(req);
  const [match] = await rows(`SELECT m.*,CASE WHEN m.user_a=$2 THEN m.user_b ELSE m.user_a END AS other_id
    FROM public.matches m JOIN public.profiles a ON a.id=m.user_a JOIN public.profiles b ON b.id=m.user_b
    WHERE m.id=$1 AND $2 IN(m.user_a,m.user_b) AND NOT a.suspended AND NOT b.suspended
    AND NOT EXISTS(SELECT 1 FROM public.blocks x WHERE (x.blocker_id=m.user_a AND x.blocked_id=m.user_b) OR(x.blocker_id=m.user_b AND x.blocked_id=m.user_a))`,[id,user.id]);
  if (!match) throw new HttpError(404,"This match is no longer available.");
  return { user,profile,match };
}
export async function requireEvent(req: Request,id: number) {
  const { user,profile } = await requireProfile(req);
  const [event] = await rows(`SELECT e.* FROM public.events e WHERE e.id=$1 AND e.cancelled_at IS NULL
    AND (e.host_id=$2 OR EXISTS(SELECT 1 FROM public.rsvps r WHERE r.event_id=e.id AND r.user_id=$2))
    AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE(b.blocker_id=$2 AND b.blocked_id=e.host_id)OR(b.blocker_id=e.host_id AND b.blocked_id=$2))`,[id,user.id]);
  if (!event) throw new HttpError(403,"Join this session to open the conversation.");
  return {user,profile,event};
}
export async function rateLimit(userId: string, kind: string, limit: number, seconds=60) {
  const key = `${userId}:${kind}:${Math.floor(Date.now()/1000/seconds)}`;
  const result = await rows(`INSERT INTO public.feature_limits(key,hits) VALUES($1,1)
    ON CONFLICT(key) DO UPDATE SET hits=feature_limits.hits+1,updated_at=now() WHERE feature_limits.hits<$2 RETURNING hits`,[key,limit]);
  if (!result.length) throw new HttpError(429,"Too many requests. Try again shortly.");
}
export async function plusMember(userId: string) {
  return !!(await rows(`SELECT 1 FROM public.subscriptions WHERE user_id=$1 AND status IN('active','trialing') AND current_period_end>now()`,[userId])).length;
}
export async function notify(tx: any, userId: string, kind: string,title: string,body: string,href: string,dedupe: string,actor: string|null=null) {
  await tx.unsafe('SELECT public.pacemate_notify($1,$2,$3,$4,$5,$6,$7)',[userId,kind,title,body,href,dedupe,actor]);
}

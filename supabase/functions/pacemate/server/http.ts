import {requestFailure} from "./request-failure.js";
import {stringList} from "./profile-data.js";
import { getUser, hasAdultTermsAcknowledgement } from "./supabase.ts";
import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { profiles } from "../db/schema.ts";
import { activeTrip, canonCity, sameCity, utcToday, tripMaxDate } from "./options.ts";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Wraps a handler so thrown HttpErrors become JSON error responses. */
export const handle = (fn: (req: Request, ctx: any) => Promise<Response>) =>
  async (req: Request, ctx: any) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      const failure=requestFailure(e),requestId=crypto.randomUUID();
      console.error('pacemate request failed',{requestId,path:new URL(req.url).pathname,method:req.method,code:failure.code});
      return json({error:failure.error,code:failure.code,requestId},failure.status);
    }
  };

export async function requireUser(req: Request) {
  const user = await getUser(req);
  if (!user) throw new HttpError(401, "Please log in.");
  return user;
}

/** Requires a logged-in member who has finished onboarding. */
export async function requireProfile(req: Request) {
  const user = await requireUser(req);
  if (!hasAdultTermsAcknowledgement(user)) throw new HttpError(403, "Confirm you are 18 or older and accept the terms before continuing.");
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) throw new HttpError(403, "Finish setting up your profile first.");
  if (profile.suspended) throw new HttpError(403, "Your account is suspended. Contact trypacemate@gmail.com.");
  return { user, profile };
}

export async function readBodyText(req: Request,limit=65536): Promise<string> {
  if(Number(req.headers.get('content-length')||0)>limit)throw new HttpError(413,'Request body is too large.');
  const reader=req.body?.getReader();if(!reader)throw new HttpError(400,'Invalid request body.');
  let total=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new HttpError(413,'Request body is too large.');}text+=decoder.decode(value,{stream:true});}
    return text+decoder.decode();
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'Invalid request body.');}
}
export async function body<T = any>(req: Request): Promise<T> {
  try{
    const value=JSON.parse(await readBodyText(req));
    if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Request body must be an object.');
    return value;
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'Invalid request body.');}
}

export const str = (v: unknown, max: number, field: string, required = false) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new HttpError(422, `${field} is required.`);
  if (s.length > max) throw new HttpError(422, `${field} must be ${max} characters or fewer.`);
  return s;
};

export const pick = <T extends string>(v: unknown, allowed: readonly T[], field: string, required = false): T | "" => {
  if (!v && !required) return "";
  if (!allowed.includes(v as T)) throw new HttpError(422, `Choose a valid ${field}.`);
  return v as T;
};

export function ageFrom(birthdate: string) {
  const b = new Date(birthdate + "T00:00:00Z"), t = new Date();
  let a = t.getUTCFullYear() - b.getUTCFullYear();
  const m = t.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && t.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

/** A member's planned trip, or nulls when there is none or its date has passed (trips expire on their own). */
export function tripOf(p: typeof profiles.$inferSelect) {
  const t = activeTrip(p);
  return { nextCity: t ? t.city : null, nextArrival: t ? t.date : null };
}

/**
 * Validates a trip from a profile update. Returns undefined when neither field was sent (keep the current trip),
 * nulls when both are empty (clear it), or the cleaned trip.
 */
export function parseTrip(b: any, currentCity: string) {
  if (b.nextCity === undefined && b.nextArrival === undefined) return undefined;
  const city = canonCity(str(b.nextCity ?? "", 60, "Trip city"));
  const day = typeof b.nextArrival === "string" ? b.nextArrival.trim() : "";
  if (!city && !day) return { nextCity: null, nextArrival: null };
  if (!city) throw new HttpError(422, "Add the city you are travelling to, or clear the trip.");
  if (!day) throw new HttpError(422, "Add your arrival date, or clear the trip.");
  const d = new Date(day + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day)
    throw new HttpError(422, "Enter a valid arrival date.");
  if (day < utcToday()) throw new HttpError(422, "Your arrival date can't be in the past.");
  if (day > tripMaxDate()) throw new HttpError(422, "Your arrival date must be within the next 12 months.");
  if (sameCity(city, currentCity)) throw new HttpError(422, `You're already in ${currentCity}. Pick a different trip city.`);
  return { nextCity: city, nextArrival: day };
}

/** The public view of a profile shown to other members. Never includes birthdate, and trips are only city and date. */
export function publicProfile(p: typeof profiles.$inferSelect) {
  return {
    id: p.id, verified: !!p.verified, name: p.name, age: ageFrom(p.birthdate), gender: p.gender, goal: p.goal,
    sports: stringList(p.sports), level: p.level, routine: p.routine, workStyle: p.workStyle,
    homeCity: p.homeCity, currentCity: p.currentCity, bio: p.bio, photos: stringList(p.photos),
    ...tripOf(p),
  };
}

export const pairOf = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string];

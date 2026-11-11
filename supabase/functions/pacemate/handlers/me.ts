import { COUNTRY_BY_CODE, countryCode } from "../money/config.js";
import { rows, arrayParam, plusMember } from "../server/feature-db.ts";
import { deleteIdentity, removeUserPhotos, deletePhotos, hasAdultTermsAcknowledgement, acknowledgeAdultTerms } from "../server/supabase.ts";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { profiles } from "../db/schema.ts";
import { handle, json, requireUser, body, str, pick, ageFrom, HttpError, tripOf, parseTrip } from "../server/http.ts";
import { GENDERS, GOALS, LEVELS, ROUTINES, WORK, SPORTS, canonCity } from "../server/options.ts";

// Past trips come back as null, so re-saving the profile never re-sends an expired date.
const own = (p: typeof profiles.$inferSelect) => ({ ...p, ...tripOf(p), age: ageFrom(p.birthdate),
  arrival: p.nextCity && p.nextArrival && p.nextArrival <= new Date().toISOString().slice(0,10) && p.nextArrival >= new Date(Date.now()-30*86400000).toISOString().slice(0,10) ? {city:p.nextCity,date:p.nextArrival} : null,
});

export default handle(async (req) => {
  const user = await requireUser(req);

  if (req.method === "GET") {
    const [p] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (p) await rows(
      `UPDATE public.profiles SET last_active_at=now()
       WHERE id=$1 AND (last_active_at IS NULL OR last_active_at<now()-interval '1 day')`,
      [user.id],
    );
    const isAdmin = p ? (await rows('SELECT 1 FROM public.app_admins WHERE user_id=$1',[user.id])).length > 0 : false;
    return json({ user: { id: user.id, email: user.email }, adultTermsAccepted: hasAdultTermsAcknowledgement(user), profile: p ? {...own(p),isAdmin} : null });
  }

  if (req.method === "POST") {
    const b = await body(req);
    if (b.adultTermsAccepted !== true) throw new HttpError(422, "Confirm you are 18 or older and accept the terms.");
    const acceptedAt = await acknowledgeAdultTerms(user, b.adultTermsAccepted);
    return json({ adultTermsAccepted: true, acceptedAt });
  }

  if (req.method === "PUT") {
    if (!hasAdultTermsAcknowledgement(user)) throw new HttpError(403, "Confirm you are 18 or older and accept the terms before continuing.");
    const b = await body(req);
    const [previous] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (previous?.suspended) throw new HttpError(403,"Your account is suspended. Contact trypacemate@gmail.com.");
    const birthdate = str(b.birthdate, 10, "Date of birth", true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate) || isNaN(Date.parse(birthdate + "T00:00:00Z")) || new Date(birthdate + "T00:00:00Z").toISOString().slice(0, 10) !== birthdate)
      throw new HttpError(422, "Enter a valid date of birth.");
    const age = ageFrom(birthdate);
    if (age < 18) throw new HttpError(422, "You must be 18 or older to use Pacemate.");
    if (age > 100) throw new HttpError(422, "Enter a valid date of birth.");

    const allowedModes = ["dating", "training_partner", "friendship"];
    const legacyGoal = typeof b.goal === "string" ? b.goal : previous?.goal || "";
    const legacyModes = previous?.connectionModes?.length ? previous.connectionModes :
      ["A relationship", "Something casual"].includes(legacyGoal) ? ["dating"] :
      legacyGoal === "Friends in a new city" ? ["friendship"] : ["training_partner"];
    const connectionModes: string[] = Array.isArray(b.connectionModes)
      ? [...new Set(b.connectionModes.filter((mode: unknown) => typeof mode === "string" && allowedModes.includes(mode)))]
      : legacyModes;
    if (!connectionModes.length || connectionModes.length > 3) throw new HttpError(422, "Choose at least one connection intention.");
    const datingEnabled = connectionModes.includes("dating");
    const interestedIn = datingEnabled && Array.isArray(b.interestedIn)
      ? b.interestedIn.filter((g: string) => (GENDERS as readonly string[]).includes(g)) : [];
    if (datingEnabled && !interestedIn.length) throw new HttpError(422, "Choose who you want to date.");
    const sports = Array.isArray(b.sports) ? [...new Set(b.sports.filter((s: string) => (SPORTS as readonly string[]).includes(s)))] as string[] : [];
    if (!sports.length) throw new HttpError(422, "Pick at least one sport.");
    if (sports.length > 8) throw new HttpError(422, "Pick up to 8 sports.");
    const photos: string[] = Array.isArray(b.photos) ? [...new Set(b.photos.filter((k: unknown) => typeof k === "string" && k.startsWith(user.id + "/")))] as string[] : [];
    if(photos.length>6)throw new HttpError(422,"Choose up to six photos.");
    if(photos.length){
      const found=await rows("SELECT name FROM storage.objects WHERE bucket_id='photos' AND name=ANY($1::text[])",[arrayParam(photos)]);
      if(found.length!==photos.length)throw new HttpError(422,"A photo is no longer available. Upload it again.");
    }
    const ageMin=datingEnabled?Number(b.ageMin??18):18,ageMax=datingEnabled?Number(b.ageMax??60):60;
    if(datingEnabled&&(!Number.isInteger(ageMin)||!Number.isInteger(ageMax)||ageMin<18||ageMax>99||ageMax<ageMin))throw new HttpError(422,"Choose an age range between 18 and 99.");
    const homeCity = canonCity(str(b.homeCity, 60, "Home city", true));
    const currentCity = canonCity(str(b.currentCity, 60, "Current city")) || homeCity;
    // Missing trip fields keep the saved trip; null or empty values clear it.
    const trip = parseTrip(b, currentCity);
    const today=new Date().toISOString().slice(0,10);
    if(trip?.nextCity&&!(previous?.nextCity&&previous?.nextArrival>=today)){
      const [planned]=await rows('SELECT count(*)::int AS n FROM public.travel_plans WHERE user_id=$1 AND arrival>=current_date',[user.id]);
      const limit=await plusMember(user.id)?5:1;
      if(Number(planned?.n||0)>=limit)throw new HttpError(422,limit===1?'Free membership includes one upcoming city. Remove an existing destination before adding another.':'You can plan up to five cities.');
    }


    const code=b.countryCode===undefined?previous?.countryCode:countryCode(b.countryCode);
    if(b.countryCode!==undefined&&!code)throw new HttpError(422,"Choose a supported country.");
    const values = {
      id: user.id,
      name: str(b.name, 30, "Name", true),
      birthdate,
      gender: pick(b.gender, GENDERS, "gender", true) as string,
      interestedIn, ageMin, ageMax,
      connectionModes,
      goal: pick(b.goal, GOALS, "goal", true) as string,
      sports,
      level: pick(b.level, LEVELS, "level") as string,
      routine: pick(b.routine, ROUTINES, "training time") as string,
      workStyle: pick(b.workStyle, WORK, "work style") as string,
      ...(code?{countryCode:code,country:COUNTRY_BY_CODE[code].name}:{}),
      homeCity,
      currentCity,
      ...trip,
      bio: str(b.bio, 500, "Bio"),
      photos,
      paused: !!b.paused,
    };
    if (values.name.length < 2) throw new HttpError(422, "Enter your name.");
    const { id, ...updates } = values;
    const [p] = await db.insert(profiles).values(values)
      .onConflictDoUpdate({ target: profiles.id, set: { ...updates, updatedAt: sql`now()` } })
      .returning();
    const removed = (previous?.photos || []).filter(key => !photos.includes(key));
    try { await deletePhotos(removed); } catch (error) { console.error("Photo cleanup needs retry", error); }
    const isAdmin=(await rows('SELECT 1 FROM public.app_admins WHERE user_id=$1',[user.id])).length>0;
    return json({ profile: {...own(p),isAdmin} });
  }

  if (req.method === "DELETE") {
    // Storage must be removed before Auth permits deleting its owner. A database trigger
    // cascades profile data when Auth deletion succeeds; failures must reach the client.
    const { cancelMemberSubscription } = await import("./billing.ts");
    await cancelMemberSubscription(user.id);
    await removeUserPhotos(user.id);
    await deleteIdentity(user.id);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
});


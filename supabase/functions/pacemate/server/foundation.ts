import {COUNTRIES} from '../money/config.js';
import {ageFrom, HttpError, str} from './http.ts';
import {stringList} from './profile-data.js';
import {MODES,DAYS,TIMES,INTENSITIES,EXPERIENCE} from '../../../../src/foundation/compatibility.js';

// Aliases are internal constants. Both discovery and swipe authorization use this predicate.
export const eligibilitySQL = `p.id<>v.id AND NOT p.paused AND NOT p.suspended AND NOT v.suspended
 AND p.connection_modes && v.connection_modes
 AND (NOT ('dating'=ANY(p.connection_modes) AND 'dating'=ANY(v.connection_modes)) OR (
 p.gender=ANY(v.interested_in) AND v.gender=ANY(p.interested_in)
 AND date_part('year',age((now() AT TIME ZONE 'UTC')::date,p.birthdate)) BETWEEN v.age_min AND v.age_max
 AND date_part('year',age((now() AT TIME ZONE 'UTC')::date,v.birthdate)) BETWEEN p.age_min AND p.age_max))
 AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=v.id AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=v.id))`;
export const sportsSQL = `(SELECT coalesce(jsonb_agg(jsonb_build_object('sport_id',s.id,'name',s.name,'experience_level',u.experience_level,'preferred_intensity',u.preferred_intensity) ORDER BY s.name),'[]'::jsonb) FROM public.user_sports u JOIN public.sports s ON s.id=u.sport_id WHERE u.user_id=p.id)`;
// Explicit allowlist, shared by profile reads and server-side compatibility inputs.
export function foundationProfile(p: any, owner=false) {
 const result: any={id:p.id,name:p.name,age:ageFrom(p.birthdate),city:p.current_city,country:p.country||'',bio:p.bio,
  verification_status:p.verified?'verified':'unverified',user_sports:typeof p.user_sports==='string'?JSON.parse(p.user_sports):p.user_sports||[]};
 for(const key of ['languages','photos','preferred_days','preferred_times','lifestyle_interests','connection_modes'])result[key]=stringList(p[key]);
 result.preferred_intensity=p.preferred_intensity||'';
 if(owner)result.birthdate=p.birthdate;
 return result;
}
export function validateFoundation(b: any) {
 const birthdate=str(b.birthdate,10,'Date of birth',true);
 const date=new Date(birthdate+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)||isNaN(date.getTime())||date.toISOString().slice(0,10)!==birthdate)throw new HttpError(422,'Enter a valid date of birth.');
 const age=ageFrom(birthdate);
 if(age<18)throw new HttpError(422,'You must be 18 or older to use Pacemate.');
 if(age>100)throw new HttpError(422,'Enter a valid date of birth.');
 const list=(key:string,max:number,choices?:string[])=>{
  if(!Array.isArray(b[key])||b[key].length>max||b[key].some((v:any)=>typeof v!=='string'||!v.trim()||v.length>100||choices&&!choices.includes(v)))throw new HttpError(422,`Check ${key.replaceAll('_',' ')}.`);
  return [...new Set(b[key].map((v:string)=>v.trim()))] as string[];
 };
 const name=str(b.name,30,'Name',true);if(name.length<2)throw new HttpError(422,'Enter your name.');
 const modes=list('connection_modes',3,Object.keys(MODES));if(!modes.length)throw new HttpError(422,'Choose a connection mode.');
 if(!Array.isArray(b.user_sports)||b.user_sports.length<1||b.user_sports.length>8||b.user_sports.some((s:any)=>!s||typeof s.sport_id!=='string'||!EXPERIENCE.includes(s.experience_level)||!INTENSITIES.includes(s.preferred_intensity))||new Set(b.user_sports.map((s:any)=>s.sport_id)).size!==b.user_sports.length)throw new HttpError(422,'Choose one to eight sports with experience and intensity.');
 if(!['',...INTENSITIES].includes(b.preferred_intensity))throw new HttpError(422,'Choose a valid intensity.');
 const country=str(b.country,80,'Country',true),known=COUNTRIES.find(c=>c.name===country||c.code===country);
 return {countryCode:known?.code||null,name,birthdate,city:str(b.city,60,'City',true),country:known?.name||country,bio:str(b.bio,500,'Bio'),languages:list('languages',12),preferred_days:list('preferred_days',7,DAYS),preferred_times:list('preferred_times',3,TIMES),lifestyle_interests:list('lifestyle_interests',12),connection_modes:modes,photos:list('photos',6),preferred_intensity:b.preferred_intensity,user_sports:b.user_sports};
}

import {handle,json,requireProfile,body,HttpError} from '../server/http.ts';
import {rows,transaction,arrayParam} from '../server/feature-db.ts';
import {canonCity} from '../options.js';
import {foundationProfile,validateFoundation,eligibilitySQL,sportsSQL} from '../server/foundation.ts';

export default handle(async(req,ctx)=>{
 const {user}=await requireProfile(req);
 const target=ctx.params.id||user.id;
 if(req.method==='GET'){
  if(ctx.params.section==='sports')return json({sports:await rows('SELECT id,name FROM public.sports ORDER BY name')});
  const [p]=await rows(`SELECT p.*,${sportsSQL} AS user_sports FROM public.profiles p JOIN public.profiles v ON v.id=$1 WHERE p.id=$2 AND (p.id=v.id OR (${eligibilitySQL}))`,[user.id,target]);
  return json({profile:p?foundationProfile(p,target===user.id):null});
 }
 if(req.method!=='PUT'||ctx.params.section||ctx.params.id)throw new HttpError(405,'Method not allowed');
 const b=validateFoundation(await body(req));
 return transaction(async tx=>{
  const [existing]=await tx.unsafe('SELECT id,suspended FROM public.profiles WHERE id=$1 FOR UPDATE',[user.id]);
  if(!existing||existing.suspended)throw new HttpError(403,'Profile unavailable.');
  const catalog=await tx.unsafe('SELECT id FROM public.sports WHERE id=ANY($1::text[])',[arrayParam(b.user_sports.map((s:any)=>s.sport_id))]);
  if(catalog.length!==b.user_sports.length)throw new HttpError(422,'Choose valid sports.');
  if(b.photos.some(key=>!key.startsWith(user.id+'/')))throw new HttpError(422,'Upload your own photos.');
  if(b.photos.length){const found=await tx.unsafe("SELECT name FROM storage.objects WHERE bucket_id='photos' AND name=ANY($1::text[])",[arrayParam(b.photos)]);if(found.length!==b.photos.length)throw new HttpError(422,'A photo is no longer available. Upload it again.');}
  await tx.unsafe(`UPDATE public.profiles SET name=$2,birthdate=$3::date,current_city=$4,country=$5,bio=$6,languages=$7::text[],preferred_days=$8::text[],preferred_times=$9::text[],preferred_intensity=$10,lifestyle_interests=$11::text[],connection_modes=$12::text[],photos=$13::text[],updated_at=now() WHERE id=$1`,[user.id,b.name,b.birthdate,canonCity(b.city),b.country,b.bio,arrayParam(b.languages),arrayParam(b.preferred_days),arrayParam(b.preferred_times),b.preferred_intensity,arrayParam(b.lifestyle_interests),arrayParam(b.connection_modes),arrayParam(b.photos)]);
  await tx.unsafe('DELETE FROM public.user_sports WHERE user_id=$1 AND NOT(sport_id=ANY($2::text[]))',[user.id,arrayParam(b.user_sports.map((s:any)=>s.sport_id))]);
  for(const s of b.user_sports)await tx.unsafe(`INSERT INTO public.user_sports(user_id,sport_id,experience_level,preferred_intensity) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,sport_id) DO UPDATE SET experience_level=excluded.experience_level,preferred_intensity=excluded.preferred_intensity`,[user.id,s.sport_id,s.experience_level,s.preferred_intensity]);
  const [p]=await tx.unsafe(`SELECT p.*,${sportsSQL} AS user_sports FROM public.profiles p WHERE p.id=$1`,[user.id]);
  return json({profile:foundationProfile(p,true)});
 });
});

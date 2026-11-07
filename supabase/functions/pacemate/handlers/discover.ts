import {handle,json,requireProfile,ageFrom,publicProfile,HttpError} from '../server/http.ts';
import {rows,arrayParam,camel,plusMember} from '../server/feature-db.ts';
import {cityCoordinates} from '../server/cities.ts';
import {cityKey,distanceKm} from '../server/validation.js';
import {SPORTS,canonCity} from '../options.js';

export default handle(async(req)=>{
  if(req.method!=='GET')throw new HttpError(405,'Method not allowed');
  const {profile:me}=await requireProfile(req);
  const q=new URL(req.url).searchParams,sport=q.get('sport')||'',scope=q.get('scope')||'anywhere',arriving=q.get('arriving')==='1',likes=q.get('likes')==='1';
  if(sport&&!SPORTS.includes(sport))throw new HttpError(422,'Choose a valid sport.');
  if(likes&&!await plusMember(me.id))throw new HttpError(403,'See who liked you with Pacemate Plus.');
  const city=canonCity((q.get('city')||'').trim().slice(0,60));
  const radius=q.get('radius')?Number(q.get('radius')):null;
  if(radius!==null&&(!Number.isFinite(radius)||radius<1||radius>2000))throw new HttpError(422,'Distance must be 1–2000 km.');
  const origin=radius?await cityCoordinates(city||me.currentCity):null;
  const filterCity=city||(scope==='city'?me.currentCity:'');
  const distanceSQL=`6371*2*asin(least(1,sqrt(power(sin(radians(c.latitude-$14::float8)/2),2)+cos(radians($14::float8))*cos(radians(c.latitude))*power(sin(radians(c.longitude-$15::float8)/2),2))))`;
  const result=await rows(`SELECT p.*,CASE WHEN $16::float8 IS NULL OR c.latitude IS NULL THEN NULL ELSE ${distanceSQL} END AS distance_km,
    (CASE WHEN p.level<>'' AND p.level=$17 THEN 1 ELSE 0 END+CASE WHEN p.routine<>'' AND p.routine=$18 THEN 1 ELSE 0 END+CASE WHEN p.goal=$19 OR p.goal='Open to all' THEN 1 ELSE 0 END) AS fit,cardinality(ARRAY(SELECT unnest(p.sports) INTERSECT SELECT unnest($13::text[]))) AS shared,
    (SELECT json_build_object('question',a.question,'answer',a.answer) FROM public.daily_answers a WHERE a.user_id=p.id AND a.day>current_date-14 ORDER BY a.day DESC LIMIT 1) AS prompt,
    EXISTS(SELECT 1 FROM public.swipes s WHERE s.swiper_id=p.id AND s.target_id=$1 AND s.liked) AS likes_you,
    coalesce(lower(p.next_city)=lower($7) AND p.next_arrival BETWEEN current_date AND current_date+60,false)
    OR EXISTS(SELECT 1 FROM public.travel_plans t JOIN public.subscriptions sub ON sub.user_id=t.user_id WHERE t.user_id=p.id AND lower(t.city)=lower($7) AND t.arrival BETWEEN current_date AND current_date+60 AND sub.status IN('active','trialing') AND sub.current_period_end>now()) AS arriving_to_me
    FROM public.profiles p LEFT JOIN public.city_coordinates c ON lower(c.display_name)=lower(p.current_city) OR c.city_key=lower(p.current_city) WHERE p.id<>$1 AND NOT p.paused AND NOT p.suspended
    AND p.gender=ANY($3::text[]) AND $2=ANY(p.interested_in)
    AND date_part('year',age((now() AT TIME ZONE 'UTC')::date,p.birthdate)) BETWEEN $5 AND $6 AND $4 BETWEEN p.age_min AND p.age_max
    AND NOT EXISTS(SELECT 1 FROM public.swipes s WHERE s.swiper_id=$1 AND s.target_id=p.id)
    AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE(b.blocker_id=$1 AND b.blocked_id=p.id)OR(b.blocker_id=p.id AND b.blocked_id=$1))
    AND($9='' OR $9=ANY(p.sports))
    AND(NOT $11 OR coalesce(lower(p.next_city)=lower($7) AND p.next_arrival BETWEEN current_date AND current_date+60,false)
      OR EXISTS(SELECT 1 FROM public.travel_plans t JOIN public.subscriptions sub ON sub.user_id=t.user_id WHERE t.user_id=p.id AND lower(t.city)=lower($7) AND t.arrival BETWEEN current_date AND current_date+60 AND sub.status IN('active','trialing') AND sub.current_period_end>now()))
    AND(NOT $12 OR EXISTS(SELECT 1 FROM public.swipes s WHERE s.swiper_id=p.id AND s.target_id=$1 AND s.liked))
    AND($8='' OR $10 OR lower(p.current_city)=lower($8) OR lower(p.home_city)=lower($8) OR(lower(p.next_city)=lower($8) AND p.next_arrival BETWEEN current_date AND current_date+60)
      OR EXISTS(SELECT 1 FROM public.travel_plans t JOIN public.subscriptions sub ON sub.user_id=t.user_id WHERE t.user_id=p.id AND lower(t.city)=lower($8) AND t.arrival BETWEEN current_date AND current_date+60 AND sub.status IN('active','trialing') AND sub.current_period_end>now()))
    AND($16::float8 IS NULL OR (c.latitude IS NOT NULL AND ${distanceSQL}<=$16::float8))
    ORDER BY shared DESC,fit DESC,arriving_to_me DESC,distance_km ASC NULLS LAST,p.updated_at DESC,p.id LIMIT 30`,[me.id,me.gender,arrayParam(me.interestedIn),ageFrom(me.birthdate),me.ageMin,me.ageMax,me.currentCity,filterCity,sport,!!radius,arriving,likes,arrayParam(me.sports),origin?.latitude??null,origin?.longitude??null,radius,me.level,me.routine,me.goal]);
  const people=result.map(p=>({...publicProfile(camel(p)),shared:p.shared,prompt:p.prompt,arrivingToMe:p.arriving_to_me,distanceKm:p.distance_km===null?null:Math.round(Number(p.distance_km))}));
  return json({people,distanceBasedOn:radius?'city-centres':null});
});

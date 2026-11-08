import {eligibilitySQL,sportsSQL,foundationProfile} from '../server/foundation.ts';
import {computeCompatibility} from '../../../../src/foundation/compatibility.js';
import {handle,json,requireProfile,publicProfile,HttpError} from '../server/http.ts';
import {rows,arrayParam,camel,plusMember} from '../server/feature-db.ts';
import {cityCoordinates} from '../server/cities.ts';
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
  const distanceSQL=`6371*2*asin(least(1,sqrt(power(sin(radians(c.latitude-$9::float8)/2),2)+cos(radians($9::float8))*cos(radians(c.latitude))*power(sin(radians(c.longitude-$10::float8)/2),2))))`;
  const result=await rows(`SELECT p.*,${sportsSQL} AS user_sports,CASE WHEN $11::float8 IS NULL OR c.latitude IS NULL THEN NULL ELSE ${distanceSQL} END AS distance_km,
    (CASE WHEN p.level<>'' AND p.level=$12 THEN 1 ELSE 0 END+CASE WHEN p.routine<>'' AND p.routine=$13 THEN 1 ELSE 0 END+CASE WHEN p.goal=$14 OR p.goal='Open to all' THEN 1 ELSE 0 END) AS fit,cardinality(ARRAY(SELECT unnest(p.sports) INTERSECT SELECT unnest($8::text[]))) AS shared,
    (SELECT json_build_object('question',a.question,'answer',a.answer) FROM public.daily_answers a WHERE a.user_id=p.id AND a.day>current_date-14 ORDER BY a.day DESC LIMIT 1) AS prompt,
    EXISTS(SELECT 1 FROM public.swipes s WHERE s.swiper_id=p.id AND s.target_id=$1 AND s.liked) AS likes_you,
    coalesce(lower(p.next_city)=lower($2) AND p.next_arrival BETWEEN current_date AND current_date+60,false)
    OR EXISTS(SELECT 1 FROM public.travel_plans t JOIN public.subscriptions sub ON sub.user_id=t.user_id WHERE t.user_id=p.id AND lower(t.city)=lower($2) AND t.arrival BETWEEN current_date AND current_date+60 AND sub.status IN('active','trialing') AND sub.current_period_end>now()) AS arriving_to_me
    FROM public.profiles p JOIN public.profiles v ON v.id=$1 LEFT JOIN public.city_coordinates c ON lower(c.display_name)=lower(p.current_city) OR c.city_key=lower(p.current_city) WHERE ${eligibilitySQL}
    AND NOT EXISTS(SELECT 1 FROM public.swipes s WHERE s.swiper_id=$1 AND s.target_id=p.id)
    AND($4='' OR $4=ANY(p.sports))
    AND(NOT $6 OR coalesce(lower(p.next_city)=lower($2) AND p.next_arrival BETWEEN current_date AND current_date+60,false)
      OR EXISTS(SELECT 1 FROM public.travel_plans t JOIN public.subscriptions sub ON sub.user_id=t.user_id WHERE t.user_id=p.id AND lower(t.city)=lower($2) AND t.arrival BETWEEN current_date AND current_date+60 AND sub.status IN('active','trialing') AND sub.current_period_end>now()))
    AND(NOT $7 OR EXISTS(SELECT 1 FROM public.swipes s WHERE s.swiper_id=p.id AND s.target_id=$1 AND s.liked))
    AND($3='' OR $5 OR lower(p.current_city)=lower($3) OR lower(p.home_city)=lower($3) OR(lower(p.next_city)=lower($3) AND p.next_arrival BETWEEN current_date AND current_date+60)
      OR EXISTS(SELECT 1 FROM public.travel_plans t JOIN public.subscriptions sub ON sub.user_id=t.user_id WHERE t.user_id=p.id AND lower(t.city)=lower($3) AND t.arrival BETWEEN current_date AND current_date+60 AND sub.status IN('active','trialing') AND sub.current_period_end>now()))
    AND($11::float8 IS NULL OR (c.latitude IS NOT NULL AND ${distanceSQL}<=$11::float8))
    ORDER BY shared DESC,fit DESC,arriving_to_me DESC,distance_km ASC NULLS LAST,p.updated_at DESC,p.id LIMIT 30`,[me.id,me.currentCity,filterCity,sport,!!radius,arriving,likes,arrayParam(me.sports),origin?.latitude??null,origin?.longitude??null,radius,me.level,me.routine,me.goal]);
  const [viewer]=await rows(`SELECT p.*,${sportsSQL} AS user_sports FROM public.profiles p WHERE p.id=$1`,[me.id]);
  const viewerFoundation=foundationProfile(viewer);
  const people=result.map(p=>{
    const candidate=foundationProfile(p);
    return {...publicProfile(camel(p)),...candidate,
      sharedConnectionModes:candidate.connection_modes.filter(mode=>viewerFoundation.connection_modes.includes(mode)),
      compatibility:computeCompatibility(viewerFoundation,candidate),shared:p.shared,prompt:p.prompt,
      arrivingToMe:p.arriving_to_me,distanceKm:p.distance_km===null?null:Math.round(Number(p.distance_km))};
  });
  return json({people,distanceBasedOn:radius?'city-centres':null});
});

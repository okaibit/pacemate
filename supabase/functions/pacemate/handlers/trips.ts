import {handle,json,requireProfile,body,str,parseTrip,HttpError} from '../server/http.ts';
import {rows,transaction,plusMember,camel} from '../server/feature-db.ts';
export default handle(async(req,ctx)=>{
  const {user,profile}=await requireProfile(req),action=ctx.params.action;
  if(action==='arrive'&&req.method==='POST'){
    const b=await body(req);
    const plan=b.tripId?(await rows('SELECT city,arrival FROM public.travel_plans WHERE id=$1 AND user_id=$2',[b.tripId,user.id]))[0]:null;
    if(b.tripId&&!plan)throw new HttpError(404,'Travel plan not found.');
    const city=plan?.city||profile.nextCity,arrival=String(plan?.arrival||profile.nextArrival||'').slice(0,10);
    const today=new Date().toISOString().slice(0,10),oldest=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    if(!city||!arrival||arrival>today||arrival<oldest)throw new HttpError(422,'There is no recent arrival to confirm.');
    await transaction(async tx=>{
      await tx.unsafe('UPDATE public.profiles SET current_city=$2,next_city=CASE WHEN $3 THEN NULL ELSE next_city END,next_arrival=CASE WHEN $3 THEN NULL ELSE next_arrival END,updated_at=now() WHERE id=$1',[user.id,city,!plan||profile.nextCity===city]);
      if(plan)await tx.unsafe('DELETE FROM public.travel_plans WHERE id=$1 AND user_id=$2',[b.tripId,user.id]);
    });return json({city});
  }
  if(action==='dismiss'&&req.method==='POST'){
    await rows('UPDATE public.profiles SET next_city=NULL,next_arrival=NULL WHERE id=$1',[user.id]);return json({ok:true});
  }
  if(req.method==='GET'){
    const plans=await rows('SELECT * FROM public.travel_plans WHERE user_id=$1 AND arrival>=current_date-30 ORDER BY arrival',[user.id]);
    return json({plans:plans.map(camel),plus:await plusMember(user.id)});
  }
  if(req.method==='DELETE'){
    await rows('DELETE FROM public.travel_plans WHERE id=$1 AND user_id=$2',[ctx.params.id,user.id]);return json({ok:true});
  }
  if(req.method==='POST'){
    if(!await plusMember(user.id))throw new HttpError(403,'Multiple planned cities require Pacemate Plus.');
    const b=await body(req),trip=parseTrip({nextCity:b.city,nextArrival:b.arrival},profile.currentCity);
    if(!trip?.nextCity)throw new HttpError(422,'Choose a city and arrival date.');
    await transaction(async tx=>{
      await tx.unsafe('SELECT id FROM public.profiles WHERE id=$1 FOR UPDATE',[user.id]);
      const [{n}]=await tx.unsafe('SELECT count(*)::int AS n FROM public.travel_plans WHERE user_id=$1 AND arrival>=current_date',[user.id]);
      if(n>=5)throw new HttpError(422,'You can plan up to five cities.');
      await tx.unsafe('INSERT INTO public.travel_plans(user_id,city,arrival) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[user.id,trip.nextCity,trip.nextArrival]);
    });return json({ok:true},201);
  }
  throw new HttpError(405,'Method not allowed');
});

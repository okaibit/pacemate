import {handle,json,requireProfile,body,str,pick,HttpError} from '../server/http.ts';
import {getUser} from '../server/supabase.ts';
import {rows,transaction,notify,rateLimit,arrayParam} from '../server/feature-db.ts';
import {EVENT_KINDS,canonCity,REGIONS,CITIES} from '../options.js';

export default handle(async(req,ctx)=>{
  const id=Number(ctx.params.id)||0,action=ctx.params.action;
  if(req.method==='GET'){
    const viewer=(await getUser(req))?.id||'';
    const params=new URL(req.url).searchParams,city=params.get('city')?.slice(0,60)||'';
    const region=params.get('region')||'';
    const regionCities=region&&REGIONS[region]?arrayParam(REGIONS[region]):null;
    const limit=Math.min(100,Math.max(1,Number(params.get('limit'))||100));
    const offset=Math.min(10000,Math.max(0,Number(params.get('offset'))||0));
    const list=await rows(`SELECT e.*,public.pacemate_next_event(e.starts_at,e.timezone,e.weekly) AS next_at,p.name AS host_name,
      (SELECT count(*)::int FROM public.rsvps r WHERE r.event_id=e.id) AS going,
      EXISTS(SELECT 1 FROM public.rsvps r WHERE r.event_id=e.id AND r.user_id=$1) AS mine,
      CASE WHEN $1='' THEN '[]'::json ELSE coalesce((SELECT json_agg(a) FROM(
        SELECT p.id,p.name,p.photos[1] AS photo FROM public.rsvps r JOIN public.profiles p ON p.id=r.user_id
        WHERE r.event_id=e.id AND NOT p.suspended AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE(b.blocker_id=$1 AND b.blocked_id=p.id)OR(b.blocker_id=p.id AND b.blocked_id=$1)) ORDER BY r.created_at LIMIT 6)a),'[]'::json) END AS attendees
      FROM public.events e LEFT JOIN public.profiles p ON p.id=e.host_id
      WHERE e.cancelled_at IS NULL AND(e.weekly OR e.starts_at>now()-interval '2 hours')
      AND(e.host_id IS NULL OR NOT p.suspended) AND($2='' OR lower(e.city)=lower($2))
      AND($5::text[] IS NULL OR e.city=ANY($5::text[])) AND(NOT $6 OR NOT e.city=ANY($7::text[]))
      AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE(b.blocker_id=$1 AND b.blocked_id=e.host_id)OR(b.blocker_id=e.host_id AND b.blocked_id=$1))
      ORDER BY next_at,e.id LIMIT $3 OFFSET $4`,[viewer,city,limit+1,offset,regionCities,region==='Other',arrayParam(CITIES)]);
    const hasMore=list.length>limit;list.splice(limit);
    const cities=await rows(`SELECT DISTINCT e.city FROM public.events e LEFT JOIN public.profiles p ON p.id=e.host_id WHERE e.cancelled_at IS NULL AND(e.host_id IS NULL OR NOT p.suspended) AND(e.weekly OR e.starts_at>now()-interval '2 hours') ORDER BY e.city`);
    return json({cities:cities.map(c=>c.city),hasMore,events:list.map(e=>({id:e.id,city:e.city,kind:e.kind,title:e.title,description:e.description,location:e.location,startsAt:e.next_at,originalStartsAt:e.starts_at,timezone:e.timezone,weekly:e.weekly,capacity:e.capacity,going:e.going,mine:e.mine,attendees:e.attendees,host:e.host_id?{id:e.host_id,name:viewer?e.host_name:'A member'}:null,isHost:viewer===e.host_id}))});
  }
  const {user}=await requireProfile(req);
  if(req.method==='POST'&&action==='rsvp'){
    const b=await body(req);
    if(typeof b.going!=='boolean')throw new HttpError(422,'Choose join or leave.');
    const result=await transaction(async tx=>{
      const [e]=await tx.unsafe('SELECT * FROM public.events WHERE id=$1 AND cancelled_at IS NULL FOR UPDATE',[id]);
      if(!e)throw new HttpError(404,'Session not found.');
      const [eligible]=await tx.unsafe(`SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM public.blocks b WHERE(b.blocker_id=$1 AND b.blocked_id=$2)OR(b.blocker_id=$2 AND b.blocked_id=$1)) AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=$2 AND suspended)`,[user.id,e.host_id]);
      if(!eligible)throw new HttpError(404,'Session not available.');
      if(!e.weekly&&new Date(e.starts_at).getTime()<Date.now()-7200000)throw new HttpError(422,'This session has ended.');
      const exists=(await tx.unsafe('SELECT 1 FROM public.rsvps WHERE event_id=$1 AND user_id=$2',[id,user.id])).length>0;
      const [{n}]=await tx.unsafe('SELECT count(*)::int AS n FROM public.rsvps WHERE event_id=$1',[id]);
      if(b.going&&!exists){if(e.capacity&&n>=e.capacity)throw new HttpError(409,'This session is full.');await tx.unsafe('INSERT INTO public.rsvps(event_id,user_id) VALUES($1,$2)',[id,user.id]);}
      if(!b.going)await tx.unsafe('DELETE FROM public.rsvps WHERE event_id=$1 AND user_id=$2',[id,user.id]);
      return {going:b.going,count:n+(b.going&&!exists?1:!b.going&&exists?-1:0)};
    });
    return json(result);
  }
  if(req.method==='DELETE'){
    await transaction(async tx=>{
      const [e]=await tx.unsafe('SELECT * FROM public.events WHERE id=$1 AND host_id=$2 AND cancelled_at IS NULL FOR UPDATE',[id,user.id]);
      if(!e)throw new HttpError(403,'Only the host can cancel this session.');
      const attendees=await tx.unsafe('SELECT user_id FROM public.rsvps WHERE event_id=$1',[id]);
      await tx.unsafe('UPDATE public.events SET cancelled_at=now(),updated_at=now() WHERE id=$1',[id]);
      for(const a of attendees)if(a.user_id!==user.id)await notify(tx,a.user_id,'session','Session cancelled',e.title,'/app/events',`cancel:${id}:${a.user_id}`,user.id);
    });return json({ok:true});
  }
  if((req.method==='POST'&&!id)||req.method==='PUT'){
    const b=await body(req),when=new Date(b.startsAt),timezone=str(b.timezone,60,'Timezone')||'UTC';
    if(!Number.isFinite(+when)||+when<Date.now())throw new HttpError(422,'Choose a future start time.');
    try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw new HttpError(422,'Invalid timezone.');}
    const capacity=b.capacity===''||b.capacity==null?null:Number(b.capacity);
    if(capacity!==null&&(!Number.isInteger(capacity)||capacity<2||capacity>500))throw new HttpError(422,'Capacity must be 2–500.');
    const values=[canonCity(str(b.city,60,'City',true)),pick(b.kind,EVENT_KINDS,'activity',true),str(b.title,80,'Title',true),str(b.description,1000,'Details'),str(b.location,120,'Meeting point',true),when.toISOString(),timezone,!!b.weekly,capacity];
    if(!id){
      await rateLimit(user.id,'host-session',10,86400);
      const e=await transaction(async tx=>{const [e]=await tx.unsafe(`INSERT INTO public.events(city,kind,title,description,location,starts_at,timezone,weekly,capacity,host_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[...values,user.id]);await tx.unsafe('INSERT INTO public.rsvps(event_id,user_id) VALUES($1,$2)',[e.id,user.id]);return e;});return json({event:e},201);
    }
    await transaction(async tx=>{
      const [e]=await tx.unsafe('SELECT * FROM public.events WHERE id=$1 AND host_id=$2 AND cancelled_at IS NULL FOR UPDATE',[id,user.id]);
      if(!e)throw new HttpError(403,'Only the host can edit this session.');
      const attendees=await tx.unsafe('SELECT user_id FROM public.rsvps WHERE event_id=$1',[id]);
      if(capacity!==null&&capacity<attendees.length)throw new HttpError(409,'Capacity cannot be below the number already going.');
      await tx.unsafe(`UPDATE public.events SET city=$1,kind=$2,title=$3,description=$4,location=$5,starts_at=$6,timezone=$7,weekly=$8,capacity=$9,updated_at=now() WHERE id=$10`,[...values,id]);
      for(const a of attendees)if(a.user_id!==user.id)await notify(tx,a.user_id,'session','Session updated',values[2] as string,'/app/events',`edit:${id}:${crypto.randomUUID()}:${a.user_id}`,user.id);
    });return json({ok:true});
  }
  throw new HttpError(405,'Method not allowed');
});

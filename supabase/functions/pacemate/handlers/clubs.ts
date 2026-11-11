import {handle,json,requireProfile,body,str,HttpError} from '../server/http.ts';
import {rows,transaction,rateLimit} from '../server/feature-db.ts';
import {canonCity} from '../options.js';

async function memberOf(clubId:number,userId:string){
  return (await rows(`SELECT 1 FROM public.run_club_members cm JOIN public.run_clubs c ON c.id=cm.club_id
    JOIN public.profiles o ON o.id=c.organizer_id
    WHERE cm.club_id=$1 AND cm.user_id=$2 AND c.archived_at IS NULL AND NOT o.suspended
      AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=c.organizer_id) OR (b.blocker_id=c.organizer_id AND b.blocked_id=$2))`,[clubId,userId])).length>0;
}

export default handle(async(req,ctx)=>{
  const {user}=await requireProfile(req),id=Number(ctx.params.id)||0,action=ctx.params.action;
  if(req.method==='GET'&&!id){
    const params=new URL(req.url).searchParams,city=params.get('city')?.trim().slice(0,60)||'',owned=params.get('owned')==='1';
    const clubs=await rows(`SELECT c.id,c.name,c.city,c.description,c.created_at AS "createdAt",
      p.id AS organizer_id,p.name AS organizer_name,p.photos[1] AS organizer_photo,
      (SELECT count(*)::int FROM public.run_club_members cm WHERE cm.club_id=c.id) AS members,
      (SELECT count(*)::int FROM public.events e WHERE e.club_id=c.id AND e.cancelled_at IS NULL AND (e.weekly OR e.starts_at>now()-interval '2 hours')) AS upcoming_runs,
      EXISTS(SELECT 1 FROM public.run_club_members cm WHERE cm.club_id=c.id AND cm.user_id=$1) AS joined
      FROM public.run_clubs c JOIN public.profiles p ON p.id=c.organizer_id
      WHERE c.archived_at IS NULL AND NOT p.suspended AND ($2='' OR lower(c.city)=lower($2))
        AND (NOT $3 OR c.organizer_id=$1)
        AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=c.organizer_id) OR (b.blocker_id=c.organizer_id AND b.blocked_id=$1))
      ORDER BY (lower(c.city)=lower($4)) DESC,c.created_at DESC,c.id DESC LIMIT 100`,[user.id,city,owned,city||'']);
    return json({clubs});
  }
  if(req.method==='POST'&&!id){
    const b=await body(req),name=str(b.name,80,'Club name',true).trim();
    const city=canonCity(str(b.city,60,'City',true));
    const description=str(b.description,1000,'Description').trim();
    if(name.length<3)throw new HttpError(422,'Club name must be at least 3 characters.');
    await rateLimit(user.id,'start-run-club',1,86400);
    const club=await transaction(async tx=>{
      const [created]=await tx.unsafe(`INSERT INTO public.run_clubs(organizer_id,name,city,description)
        VALUES($1,$2,$3,$4) RETURNING id,name,city,description,created_at AS "createdAt"`,[user.id,name,city,description]);
      await tx.unsafe('INSERT INTO public.run_club_members(club_id,user_id) VALUES($1,$2)',[created.id,user.id]);
      return created;
    });
    return json({club},201);
  }
  if(!id)throw new HttpError(404,'Run club not found.');

  if(req.method==='GET'&&!action){
    const [club]=await rows(`SELECT c.id,c.name,c.city,c.description,c.organizer_id,c.created_at AS "createdAt",
      p.name AS organizer_name,p.photos[1] AS organizer_photo,
      (SELECT count(*)::int FROM public.run_club_members cm WHERE cm.club_id=c.id) AS members,
      EXISTS(SELECT 1 FROM public.run_club_members cm WHERE cm.club_id=c.id AND cm.user_id=$2) AS joined,
      c.organizer_id=$2 AS "isOrganizer"
      FROM public.run_clubs c JOIN public.profiles p ON p.id=c.organizer_id
      WHERE c.id=$1 AND c.archived_at IS NULL AND NOT p.suspended
        AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=c.organizer_id) OR (b.blocker_id=c.organizer_id AND b.blocked_id=$2))`,[id,user.id]);
    if(!club)throw new HttpError(404,'Run club not found.');
    const events=await rows(`SELECT e.id,e.club_id,e.city,e.kind,e.title,e.description,e.location,
      public.pacemate_next_event(e.starts_at,e.timezone,e.weekly) AS "startsAt",e.timezone,e.weekly,e.capacity,
      (SELECT count(*)::int FROM public.rsvps r WHERE r.event_id=e.id) AS going,
      EXISTS(SELECT 1 FROM public.rsvps r WHERE r.event_id=e.id AND r.user_id=$2) AS mine,
      coalesce((SELECT json_agg(a) FROM (
        SELECT p.id,p.name,p.photos[1] AS photo FROM public.rsvps r JOIN public.profiles p ON p.id=r.user_id
        WHERE r.event_id=e.id AND NOT p.suspended
          AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=$2))
        ORDER BY r.created_at LIMIT 6
      ) a),'[]'::json) AS attendees,
      e.host_id=$2 AS "isHost"
      FROM public.events e WHERE e.club_id=$1 AND e.cancelled_at IS NULL
        AND (e.weekly OR e.starts_at>now()-interval '2 hours')
      ORDER BY public.pacemate_next_event(e.starts_at,e.timezone,e.weekly),e.id LIMIT 50`,[id,user.id]);
    const members=club.joined?await rows(`SELECT p.id,p.name,p.photos[1] AS photo
      FROM public.run_club_members cm JOIN public.profiles p ON p.id=cm.user_id
      WHERE cm.club_id=$1 AND NOT p.suspended
        AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=$2))
      ORDER BY cm.joined_at LIMIT 50`,[id,user.id]):[];
    return json({club,events,members,canChat:club.joined});
  }

  if(req.method==='POST'&&action==='join'){
    await transaction(async tx=>{
      const [club]=await tx.unsafe(`SELECT c.id,c.organizer_id FROM public.run_clubs c JOIN public.profiles p ON p.id=c.organizer_id
        WHERE c.id=$1 AND c.archived_at IS NULL AND NOT p.suspended
          AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=c.organizer_id) OR (b.blocker_id=c.organizer_id AND b.blocked_id=$2)) FOR UPDATE OF c`,[id,user.id]);
      if(!club)throw new HttpError(404,'Run club not found.');
      await tx.unsafe('INSERT INTO public.run_club_members(club_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,user.id]);
    });
    return json({joined:true});
  }

  if(req.method==='DELETE'&&action==='archive'){
    const [club]=await rows(`UPDATE public.run_clubs SET archived_at=now()
      WHERE id=$1 AND organizer_id=$2 AND archived_at IS NULL RETURNING id`,[id,user.id]);
    if(!club)throw new HttpError(404,'Run club not found.');
    return json({archived:true});
  }

  if(req.method==='DELETE'&&(!action||action==='membership')){
    const [club]=await rows('SELECT organizer_id FROM public.run_clubs WHERE id=$1 AND archived_at IS NULL',[id]);
    if(!club)throw new HttpError(404,'Run club not found.');
    if(club.organizer_id===user.id)throw new HttpError(409,'Organizers cannot leave their own club yet.');
    await rows('DELETE FROM public.run_club_members WHERE club_id=$1 AND user_id=$2',[id,user.id]);
    return json({joined:false});
  }

  if(action==='messages'){
    if(!await memberOf(id,user.id))throw new HttpError(403,'Join this run club to open its chat.');
    if(req.method==='GET'){
      const after=Math.max(0,Number(new URL(req.url).searchParams.get('after'))||0);
      const messages=await rows(`SELECT m.id,m.body,m.created_at AS "createdAt",m.sender_id=$2 AS mine,p.name
        FROM public.run_club_messages m JOIN public.profiles p ON p.id=m.sender_id
        WHERE m.club_id=$1 AND m.id>$3 AND NOT p.suspended
          AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=m.sender_id) OR (b.blocker_id=m.sender_id AND b.blocked_id=$2))
        ORDER BY m.id LIMIT 101`,[id,user.id,after]);
      const hasMore=messages.length>100;messages.splice(100);
      return json({club:{id},messages,hasMore,cursor:messages.at(-1)?.id||after});
    }
    if(req.method==='POST'){
      await rateLimit(user.id,'run-club-message',20);
      const text=str((await body(req)).body,2000,'Message',true).trim();
      if(!text)throw new HttpError(422,'Write a message first.');
      const [message]=await rows(`INSERT INTO public.run_club_messages(club_id,sender_id,body)
        SELECT c.id,$2,$3 FROM public.run_clubs c JOIN public.profiles o ON o.id=c.organizer_id
        JOIN public.run_club_members cm ON cm.club_id=c.id AND cm.user_id=$2
        WHERE c.id=$1 AND c.archived_at IS NULL AND NOT o.suspended
        RETURNING id,body,created_at AS "createdAt"`,[id,user.id,text]);
      if(!message)throw new HttpError(403,'Join this run club to send messages.');
      return json({message:{...message,mine:true}},201);
    }
  }
  throw new HttpError(405,'Method not allowed');
});

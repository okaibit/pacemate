import {handle,json,body,str,HttpError} from '../server/http.ts';
import {rows,transaction,requireAdmin,notify} from '../server/feature-db.ts';
import {signedPhoto,deletePrivate,deletePhotos,setIdentityBan} from '../server/supabase.ts';

export default handle(async(req,ctx)=>{
  const {user}=await requireAdmin(req);
  const section=ctx.params.section||'reports',id=ctx.params.id;
  if(req.method==='GET'){
    if(section==='metrics'){const [metrics]=await rows(`
      WITH profile_scores AS (
        SELECT p.id,p.connection_modes,p.last_active_at,
          (p.name<>'')::int + (p.birthdate IS NOT NULL)::int +
          ((p.city<>'' AND p.country<>''))::int + (p.bio<>'')::int +
          (cardinality(p.languages)>0)::int + (cardinality(p.photos)>0)::int +
          ((cardinality(p.preferred_days)>0 AND cardinality(p.preferred_times)>0))::int +
          (p.preferred_intensity IN ('low','moderate','high'))::int +
          (cardinality(p.lifestyle_interests)>0)::int +
          (cardinality(p.connection_modes)>0)::int +
          (EXISTS(SELECT 1 FROM public.user_sports us WHERE us.user_id=p.id) AND NOT EXISTS(
            SELECT 1 FROM public.user_sports us WHERE us.user_id=p.id
              AND (us.experience_level NOT IN ('beginner','intermediate','advanced')
                OR us.preferred_intensity NOT IN ('low','moderate','high'))
          ))::int AS completion_fields
        FROM public.profiles p
      )
      SELECT
        (SELECT count(*)::int FROM public.profiles) AS total_profiles,
        (SELECT count(*)::int FROM profile_scores WHERE connection_modes @> ARRAY['dating']::text[]) AS date_enabled_profiles,
        (SELECT count(*)::int FROM profile_scores WHERE completion_fields=11) AS complete_profiles,
        (SELECT count(*)::int FROM profile_scores WHERE completion_fields=11 AND connection_modes @> ARRAY['dating']::text[]) AS complete_date_profiles,
        (SELECT count(*)::int FROM profile_scores WHERE last_active_at>=now()-interval '7 days') AS active_7d,
        (SELECT count(*)::int FROM profile_scores WHERE last_active_at>=now()-interval '30 days') AS active_30d,
        (SELECT count(*)::int FROM public.swipes WHERE intention='date' AND liked AND acted_at>=now()-interval '30 days') AS date_likes_30d,
        (SELECT count(*)::int FROM public.matches WHERE intention='date' AND created_at>=now()-interval '30 days') AS date_matches_30d,
        (SELECT count(*)::int FROM public.matches WHERE intention='date' AND ended_at IS NULL) AS active_date_matches
    `);return json({metrics:metrics||{}});}
    if(section==='reports')return json({reports:await rows(`SELECT r.*,p.name,p.photos,p.suspended FROM public.reports r LEFT JOIN public.profiles p ON p.id=r.reported_id ORDER BY (r.status='open') DESC,r.id DESC LIMIT 100`)});
    if(section==='blocks')return json({blocks:await rows(`SELECT b.blocker_id||':'||b.blocked_id AS id,b.*,p.name AS blocker_name,q.name AS blocked_name FROM public.blocks b JOIN public.profiles p ON p.id=b.blocker_id JOIN public.profiles q ON q.id=b.blocked_id ORDER BY b.created_at DESC LIMIT 100`)});
    if(section==='verifications'){
      const requests=await rows(`SELECT v.*,p.name,p.photos FROM public.verification_requests v JOIN public.profiles p ON p.id=v.user_id WHERE v.status='pending' ORDER BY v.created_at LIMIT 40`);
      for(let start=0;start<requests.length;start+=5)await Promise.all(requests.slice(start,start+5).map(async request=>{request.selfieUrl=request.selfie_key?await signedPhoto('verification',request.selfie_key):null;}));
      return json({requests});
    }
    if(section==='members'){
      const q=new URL(req.url).searchParams.get('q')?.trim().slice(0,60)||'';
      return json({members:q?await rows(`SELECT id,name,photos,current_city,suspended,verified FROM public.profiles WHERE name ILIKE $1 OR id=$2 ORDER BY updated_at DESC LIMIT 40`,['%'+q.replace(/[%_]/g,'\\$&')+'%',q]):[]});
    }
    if(section==='actions')return json({actions:await rows('SELECT * FROM public.moderation_actions ORDER BY id DESC LIMIT 100')});
  }
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
  const b=await body(req),note=str(b.note,1000,'Note',true);
  if(section==='reports'){
    if(!['reviewed','dismissed'].includes(b.status))throw new HttpError(422,'Choose a resolution.');
    const updated=await rows(`UPDATE public.reports SET status=$2,resolution=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1 RETURNING id`,[Number(id),b.status,note,user.id]);
    if(!updated.length)throw new HttpError(404,'Report not found.');
    return json({ok:true});
  }
  if(section==='verifications'){
    if(b.status==='approved'&&b.confirmed!==true)throw new HttpError(422,'Confirm that you compared the selfie and profile photos.');
    if(!['approved','rejected'].includes(b.status))throw new HttpError(422,'Choose approve or reject.');
    const result=await transaction(async tx=>{
      const [v]=await tx.unsafe(`SELECT v.*,p.photos FROM public.verification_requests v JOIN public.profiles p ON p.id=v.user_id WHERE v.id=$1 AND v.status='pending' FOR UPDATE OF p`,[id]);
      if(!v)throw new HttpError(404,'Request is no longer pending.');
      const pending=await tx.unsafe("SELECT 1 FROM public.verification_requests WHERE id=$1 AND status='pending' FOR UPDATE",[id]);
      if(!pending.length)throw new HttpError(409,'Request is no longer pending.');
      if(v.user_id===user.id)throw new HttpError(403,'Another administrator must review your verification.');
      if(b.status==='approved'&&JSON.stringify(v.photos)!==JSON.stringify(v.profile_photos))throw new HttpError(409,'Profile photos changed. Request a new selfie.');
      await tx.unsafe(`UPDATE public.profiles SET verified=$2 WHERE id=$1`,[v.user_id,b.status==='approved']);
      await tx.unsafe(`UPDATE public.verification_requests SET status=$2,note=$3,reviewed_by=$4,reviewed_at=now(),selfie_key=NULL WHERE id=$1`,[id,b.status,note,user.id]);
      await tx.unsafe(`INSERT INTO public.moderation_actions(actor_id,target_id,action,note) VALUES($1,$2,$3,$4)`,[user.id,v.user_id,'verification:'+b.status,note]);
      await notify(tx,v.user_id,'verification',b.status==='approved'?'Your profile is verified':'Verification reviewed',note,'/app/settings','verification:'+id);
      return v;
    });
    if(result.selfie_key)await deletePrivate('verification',[result.selfie_key]);
    return json({ok:true});
  }
  if(section==='members'){
    if(id===user.id)throw new HttpError(403,'You cannot moderate your own account.');
    if(!['warn','suspend','restore','remove-photo'].includes(b.action))throw new HttpError(422,'Choose a valid action.');
    await transaction(async tx=>{
      const [p]=await tx.unsafe('SELECT * FROM public.profiles WHERE id=$1 FOR UPDATE',[id]);
      if(!p)throw new HttpError(404,'Member not found.');
      if(b.action==='remove-photo'){
        if(typeof b.key!=='string'||!p.photos.includes(b.key))throw new HttpError(422,'Photo not found.');
        await tx.unsafe('UPDATE public.profiles SET photos=array_remove(photos,$2),updated_at=now() WHERE id=$1',[id,b.key]);
      }
      if(['suspend','restore'].includes(b.action))await tx.unsafe('UPDATE public.profiles SET suspended=$2 WHERE id=$1',[id,b.action==='suspend']);
      await tx.unsafe(`INSERT INTO public.moderation_actions(actor_id,target_id,action,note) VALUES($1,$2,$3,$4)`,[user.id,id,b.action,note]);
      if(b.action!=='suspend')await notify(tx,id,'warning','An update from Pacemate',note,'/app/settings',`moderation:${crypto.randomUUID()}`);
    });
    if(b.action==='remove-photo')await deletePhotos([b.key]);
    let warning='';
    if(['suspend','restore'].includes(b.action)){
      try{await setIdentityBan(id,b.action==='suspend');}catch{warning='Account restriction saved. Authentication service update needs retry.';}
    }
    return json({ok:true,warning});
  }
  throw new HttpError(404,'Not found');
});

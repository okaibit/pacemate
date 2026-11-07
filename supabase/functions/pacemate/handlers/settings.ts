import {handle,json,requireProfile,body,HttpError} from '../server/http.ts';
import {rows,camel} from '../server/feature-db.ts';

export default handle(async(req,ctx)=>{
  const {user}=await requireProfile(req);
  if(ctx.params.section==='blocks'){
    if(req.method==='GET')return json({blocks:await rows(`SELECT b.blocked_id AS id,p.name,b.created_at FROM public.blocks b JOIN public.profiles p ON p.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC`,[user.id])});
    if(req.method==='DELETE'){
      await rows('DELETE FROM public.blocks WHERE blocker_id=$1 AND blocked_id=$2',[user.id,ctx.params.id]);
      return json({ok:true});
    }
  }
  await rows('INSERT INTO public.notification_settings(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user.id]);
  if(req.method==='GET'){
    const [settings]=await rows(`SELECT email_matches,email_messages,email_sessions,email_streaks,push_enabled,timezone,reminder_hour FROM public.notification_settings WHERE user_id=$1`,[user.id]);
    return json({settings:camel(settings),pushKey:Deno.env.get('VAPID_PUBLIC_KEY')||'',emailAvailable:!!(Deno.env.get('RESEND_API_KEY')&&Deno.env.get('PACEMATE_EMAIL_FROM'))});
  }
  if(req.method==='PUT'){
    const b=await body(req),timezone=typeof b.timezone==='string'?b.timezone:'UTC';
    try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw new HttpError(422,'Choose a valid timezone.');}
    const hour=Number(b.reminderHour);
    if(!Number.isInteger(hour)||hour<0||hour>23)throw new HttpError(422,'Choose a valid reminder time.');
    await rows(`UPDATE public.notification_settings SET email_matches=$2,email_messages=$3,email_sessions=$4,email_streaks=$5,push_enabled=$6,timezone=$7,reminder_hour=$8 WHERE user_id=$1`,[user.id,!!b.emailMatches,!!b.emailMessages,!!b.emailSessions,!!b.emailStreaks,!!b.pushEnabled,timezone,hour]);
    return json({ok:true});
  }
  throw new HttpError(405,'Method not allowed');
});

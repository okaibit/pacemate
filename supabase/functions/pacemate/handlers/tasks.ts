import {json,HttpError} from '../server/http.ts';
import {rows,transaction,rateLimit} from '../server/feature-db.ts';
import {internalHref} from '../server/validation.js';
import {deletePrivate} from '../server/supabase.ts';

const appUrl=()=> (Deno.env.get('PACEMATE_APP_URL')||'https://pacematess.netlify.app').replace(/\/$/,'');
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function email(n:any){
  const key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('PACEMATE_EMAIL_FROM');
  if(!key||!from)return 'unconfigured';
  if(!n.email||!n.email_confirmed_at)return 'skipped';
  const category=n.kind==='match'?'email_matches':n.kind==='message'?'email_messages':n.kind==='streak'?'email_streaks':'email_sessions';
  if(!n[category])return 'skipped';
  const href=appUrl()+internalHref(n.href),unsubscribe=appUrl()+'/unsubscribe?token='+n.unsubscribe_token;
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`pacemate-notification-${n.id}`},
    body:JSON.stringify({from,to:[n.email],reply_to:'trypacemate@gmail.com',subject:n.title,
      html:`<h1>${escape(n.title)}</h1><p>${escape(n.body)}</p><p><a href="${escape(href)}">Open Pacemate</a></p><p><a href="${escape(unsubscribe)}">Unsubscribe</a></p>`,
      text:`${n.title}\n${n.body}\n${href}\n\nUnsubscribe: ${unsubscribe}`}),signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)throw new Error(`EMAIL_PROVIDER_${response.status}`);
  return 'sent';
}
async function push(n:any){
  if(!n.push_enabled)return 'skipped';
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY');
  if(!publicKey||!privateKey)return 'unconfigured';
  const subscribers=await rows('SELECT * FROM public.push_subscriptions WHERE user_id=$1 LIMIT 5',[n.user_id]);
  if(!subscribers.length)return 'skipped';
  const {default:webpush}=await import('web-push');
  webpush.setVapidDetails('mailto:trypacemate@gmail.com',publicKey,privateKey);
  let failed=false;
  await Promise.all(subscribers.map(async s=>{
    try{
      const details=webpush.generateRequestDetails({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify({title:n.title,body:n.body,href:internalHref(n.href),tag:`pacemate-${n.id}`}),{TTL:3600});
      const response=await fetch(details.endpoint,{method:details.method,headers:Object.fromEntries(Object.entries(details.headers).map(([key,value])=>[key,String(value)])),body:details.body?new Uint8Array(details.body).buffer:undefined,signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Object.assign(new Error('Push service rejected delivery'),{statusCode:response.status});
    }
    catch(error){if([404,410].includes(error.statusCode))await rows('DELETE FROM public.push_subscriptions WHERE id=$1',[s.id]);else failed=true;}
  }));
  if(failed)throw new Error('PUSH_DELIVERY_FAILED');
  return 'sent';
}
export default async(req:Request)=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  await rateLimit('system','dispatch',1,50);
  const started=Date.now();
  await rows(`SELECT public.pacemate_notify(r.user_id,'session','Your session starts soon',e.title,'/app/events',
    'reminder:'||e.id||':'||public.pacemate_next_event(e.starts_at,e.timezone,e.weekly)::text||':'||r.user_id,e.host_id)
    FROM public.events e JOIN public.rsvps r ON r.event_id=e.id WHERE e.cancelled_at IS NULL
    AND public.pacemate_next_event(e.starts_at,e.timezone,e.weekly) BETWEEN now()+interval '45 minutes' AND now()+interval '75 minutes'`);
  await rows(`SELECT public.pacemate_notify(p.id,'streak','Keep your streak going','A moment for your daily check-in.','/app/today',
    'streak:'||p.id||':'||(now() AT TIME ZONE s.timezone)::date::text)
    FROM public.profiles p JOIN public.notification_settings s ON s.user_id=p.id
    WHERE NOT p.suspended AND (s.email_streaks OR s.push_enabled)
    AND extract(hour FROM now() AT TIME ZONE s.timezone)=s.reminder_hour
    AND (EXISTS(SELECT 1 FROM public.checkins c WHERE c.user_id=p.id AND cardinality(c.areas)>0 AND c.day=(now() AT TIME ZONE s.timezone)::date-1)
      OR EXISTS(SELECT 1 FROM public.workouts w WHERE w.user_id=p.id AND w.day=(now() AT TIME ZONE s.timezone)::date-1))
    AND NOT EXISTS(SELECT 1 FROM public.checkins c WHERE c.user_id=p.id AND cardinality(c.areas)>0 AND c.day=(now() AT TIME ZONE s.timezone)::date)
    AND NOT EXISTS(SELECT 1 FROM public.workouts w WHERE w.user_id=p.id AND w.day=(now() AT TIME ZONE s.timezone)::date)`);
  await rows(`UPDATE public.notifications SET email_state='expired',push_state='expired' WHERE created_at<now()-interval '24 hours' AND(email_state IN('pending','sending','unconfigured')OR push_state IN('pending','sending','unconfigured'))`);
  const emailReady=!!(Deno.env.get('RESEND_API_KEY')&&Deno.env.get('PACEMATE_EMAIL_FROM'));
  const pushReady=!!(Deno.env.get('VAPID_PUBLIC_KEY')&&Deno.env.get('VAPID_PRIVATE_KEY'));
  let delivered=0;
  for(let i=0;i<3&&Date.now()-started<35000;i++){
    const n=await transaction(async tx=>{
      const [n]=await tx.unsafe(`SELECT n.*,s.*,u.email,u.email_confirmed_at,n.id AS notification_id FROM public.notifications n
        JOIN public.notification_settings s ON s.user_id=n.user_id JOIN auth.users u ON u.id::text=n.user_id JOIN public.profiles p ON p.id=n.user_id
        WHERE NOT p.suspended AND n.created_at>now()-interval '24 hours' AND(n.claim_until IS NULL OR n.claim_until<now())
        AND(((n.email_state IN('pending','sending')OR(n.email_state='unconfigured'AND $1))AND n.email_attempts<5)OR((n.push_state IN('pending','sending')OR(n.push_state='unconfigured'AND $2))AND n.push_attempts<5))
        ORDER BY n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1`,[emailReady,pushReady]);
      if(!n)return null;
      await tx.unsafe(`UPDATE public.notifications SET claim_until=now()+interval '2 minutes' WHERE id=$1`,[n.notification_id]);
      return {...n,id:n.notification_id};
    });
    if(!n)break;
    const states:any={};
    for(const channel of ['email','push']){
      if(['sent','skipped','expired'].includes(n[channel+'_state'])||n[channel+'_attempts']>=5)continue;
      try{states[channel]=await(channel==='email'?email(n):push(n));}
      catch(error){states[channel]='pending';console.error('notification delivery failed',{id:n.id,channel,code:channel==='email'&&/^EMAIL_PROVIDER_\d+$/.test(error.message)?error.message:channel.toUpperCase()+'_DELIVERY_FAILED'});}
      // Unconfigured providers do not consume retry attempts.
      await rows(`UPDATE public.notifications SET ${channel}_state=$2,${channel}_attempts=${channel}_attempts+$3,claim_until=now()+interval '2 minutes' WHERE id=$1`,[n.id,states[channel],states[channel]==='unconfigured'?0:1]);
    }
    if(states.email==='sent'||states.push==='sent')delivered++;
  }
  // Private orphan files never become public; remove detached uploads regularly.
  const orphans=await rows(`SELECT o.name FROM storage.objects o WHERE o.bucket_id='chat' AND o.created_at<now()-interval '1 day'
    AND NOT EXISTS(SELECT 1 FROM public.chat_attachments a JOIN public.messages m ON m.attachment_id=a.id WHERE a.object_key=o.name) LIMIT 30`);
  await deletePrivate('chat',orphans.map(o=>o.name));
  await rows(`UPDATE public.verification_requests SET status='withdrawn',note='Request expired',reviewed_at=now() WHERE status='pending' AND created_at<now()-interval '30 days'`);
  await rows(`UPDATE public.verification_requests SET selfie_key=NULL WHERE status<>'pending' AND selfie_key IS NOT NULL RETURNING selfie_key`);
  // Rows updated above no longer expose the key; obsolete files are selected from
  // Storage instead, which also handles accounts removed outside the app.
  const oldSelfies=await rows(`SELECT o.name FROM storage.objects o WHERE o.bucket_id='verification' AND o.created_at<now()-interval '1 day'
    AND NOT EXISTS(SELECT 1 FROM public.verification_requests v WHERE v.selfie_key=o.name AND v.status='pending') LIMIT 30`);
  await deletePrivate('verification',oldSelfies.map(o=>o.name));
  const abandonedPhotos=await rows(`SELECT o.name FROM storage.objects o WHERE o.bucket_id='photos' AND o.created_at<now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE o.name=ANY(p.photos)) LIMIT 30`);
  if(abandonedPhotos.length){const {deletePhotos}=await import('../server/supabase.ts');await deletePhotos(abandonedPhotos.map(o=>o.name));}
  await rows(`DELETE FROM public.feature_limits WHERE updated_at<now()-interval '2 days'`);
  return json({ok:true,delivered});
};

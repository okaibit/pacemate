import {handle,json,requireProfile,body,HttpError} from '../server/http.ts';
import {rows,rateLimit} from '../server/feature-db.ts';
import {validPushSubscription} from '../server/validation.js';

export default handle(async(req,ctx)=>{
  const action=ctx.params.action;
  if(action==='unsubscribe'){
    if(req.method!=='POST')throw new HttpError(405,'Use the unsubscribe button to confirm.');
    const token=(await body(req)).token;
    if(typeof token!=='string'||!/^[0-9a-f-]{36}$/i.test(token))throw new HttpError(422,'Invalid unsubscribe link.');
    await rows(`UPDATE public.notification_settings SET email_matches=false,email_messages=false,email_sessions=false,email_streaks=false WHERE unsubscribe_token=$1::uuid`,[token]);
    return json({ok:true});
  }
  const {user}=await requireProfile(req);
  if(action==='push'){
    if(req.method==='GET'){
      const endpoint=new URL(req.url).searchParams.get('endpoint');
      if(!endpoint||endpoint.length>2048)throw new HttpError(422,'Missing subscription.');
      const [subscription]=await rows('SELECT 1 FROM public.push_subscriptions WHERE user_id=$1 AND endpoint=$2',[user.id,endpoint]);
      const [settings]=await rows('SELECT push_enabled FROM public.notification_settings WHERE user_id=$1',[user.id]);
      return json({subscribed:!!subscription,enabled:!!subscription&&settings?.push_enabled===true});
    }
    const b=await body(req);
    if(req.method==='DELETE'){
      if(typeof b.endpoint!=='string')throw new HttpError(422,'Missing subscription.');
      await rows('DELETE FROM public.push_subscriptions WHERE user_id=$1 AND endpoint=$2',[user.id,b.endpoint]);return json({ok:true});
    }
    if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
    if(!Deno.env.get('VAPID_PUBLIC_KEY')||!Deno.env.get('VAPID_PRIVATE_KEY'))throw new HttpError(503,'Push delivery is not configured yet.');
    if(!validPushSubscription(b))throw new HttpError(422,'Invalid push subscription.');
    await rateLimit(user.id,'push-subscribe',10,3600);
    const [{n}]=await rows('SELECT count(*)::int AS n FROM public.push_subscriptions WHERE user_id=$1 AND endpoint<>$2',[user.id,b.endpoint]);
    if(n>=5)throw new HttpError(409,'Five devices are already subscribed. Remove one before adding another.');
    const registered=await rows(`INSERT INTO public.push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth
      WHERE push_subscriptions.user_id=EXCLUDED.user_id RETURNING user_id`,[user.id,b.endpoint,b.keys.p256dh,b.keys.auth]);
    if(!registered.length)throw new HttpError(409,'This device is registered to another account. Sign out of that account first.');
    await rows('INSERT INTO public.notification_settings(user_id,push_enabled) VALUES($1,true) ON CONFLICT(user_id) DO UPDATE SET push_enabled=true',[user.id]);
    return json({ok:true});
  }
  if(req.method==='GET'){
    const before=Math.max(0,Number(new URL(req.url).searchParams.get('before'))||0);
    const items=await rows(`SELECT id,kind,title,body,href,read_at AS "readAt",created_at AS "createdAt" FROM public.notifications WHERE user_id=$1 AND($2::bigint=0 OR id<$2) ORDER BY id DESC LIMIT 51`,[user.id,before]);
    const [{unread}]=await rows('SELECT count(*)::int AS unread FROM public.notifications WHERE user_id=$1 AND read_at IS NULL',[user.id]);
    const hasMore=items.length>50;items.splice(50);return json({items,unread,hasMore});
  }
  if(req.method==='PUT'){
    const b=await body(req);
    if(b.all===true)await rows('UPDATE public.notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',[user.id]);
    else if(Number.isSafeInteger(Number(b.id)))await rows('UPDATE public.notifications SET read_at=now() WHERE id=$1 AND user_id=$2',[Number(b.id),user.id]);
    else throw new HttpError(422,'Choose a notification.');
    return json({ok:true});
  }
  throw new HttpError(405,'Method not allowed');
});

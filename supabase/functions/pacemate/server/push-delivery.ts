import {rows,transaction} from './feature-db.ts';
import {internalHref,validPushSubscription} from './validation.js';

async function socialAllowed(n:any){
 const matchId=/^\/app\/matches\/(\d+)$/.exec(n.href)?.[1];
 if(!matchId)return false;
 const [match]=await rows(`SELECT m.* FROM public.matches m JOIN public.profiles a ON a.id=m.user_a JOIN public.profiles b ON b.id=m.user_b
  WHERE m.id=$1 AND $2 IN(m.user_a,m.user_b) AND NOT a.suspended AND NOT b.suspended
  AND NOT EXISTS(SELECT 1 FROM public.blocks x WHERE(x.blocker_id=m.user_a AND x.blocked_id=m.user_b)OR(x.blocker_id=m.user_b AND x.blocked_id=m.user_a))`,[Number(matchId),n.user_id]);
 if(!match)return false;
 if(n.kind==='message'){
  const messageId=/^message:(\d+)$/.exec(n.dedupe_key)?.[1];
  if(!messageId)return false;
  const [message]=await rows('SELECT id FROM public.messages WHERE id=$1 AND match_id=$2 AND sender_id<>$3 AND read_at IS NULL',[Number(messageId),Number(matchId),n.user_id]);
  if(!message)return false;
  const muted=await rows(`SELECT 1 FROM public.conversation_members cm JOIN public.conversations c ON c.id=cm.conversation_id
    WHERE cm.user_id=$1 AND cm.muted_until>now() AND ((c.user_a=$2 AND c.user_b=$3)OR(c.user_a=$3 AND c.user_b=$2))`,[n.user_id,match.user_a,match.user_b]);
  if(muted.length)return false;
 }
 return true;
}
export async function deliverPushNotification(n:any){
 if(!n.push_enabled||n.read_at)return 'skipped';
 const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY');
 if(!publicKey||!privateKey)return 'unconfigured';
 if(['match','message'].includes(n.kind)&&!await socialAllowed(n))return 'skipped';
 const subscribers=await rows('SELECT * FROM public.push_subscriptions WHERE user_id=$1 LIMIT 5',[n.user_id]);
 const valid=subscribers.filter(s=>validPushSubscription({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}}));
 if(!valid.length)return 'skipped';
 const {default:webpush}=await import('web-push');
 webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')||'mailto:trypacemate@gmail.com',publicKey,privateKey);
 const title=n.kind==='message'?'New message':n.kind==='match'?'You have a new match':n.title;
 const body=n.kind==='message'?'Open Pacemate to read your message.':n.kind==='match'?'Open Pacemate to say hello.':n.body;
 let failed=false,accepted=0;
 await Promise.all(valid.map(async s=>{
  try{
   const details=webpush.generateRequestDetails({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify({title,body,href:internalHref(n.href),tag:`pacemate-${n.id}`}),{TTL:3600});
   const response=await fetch(details.endpoint,{method:details.method,headers:Object.fromEntries(Object.entries(details.headers).map(([k,v])=>[k,String(v)])),body:details.body?new Uint8Array(details.body).buffer:undefined,signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Object.assign(new Error('Push delivery failed'),{statusCode:response.status});
   accepted++;
  }catch(error){if([404,410].includes(error.statusCode))await rows('DELETE FROM public.push_subscriptions WHERE id=$1',[s.id]);else failed=true;}
 }));
 if(failed)throw new Error('PUSH_DELIVERY_FAILED');
 return accepted?'sent':'skipped';
}
export async function dispatchSocialPush(dedupe:string){
 if(!Deno.env.get('VAPID_PUBLIC_KEY')||!Deno.env.get('VAPID_PRIVATE_KEY'))return;
 const n=await transaction(async tx=>{
  const [notification]=await tx.unsafe(`SELECT n.*,s.push_enabled FROM public.notifications n JOIN public.notification_settings s ON s.user_id=n.user_id
   WHERE n.dedupe_key=$1 AND n.kind IN('match','message') AND n.read_at IS NULL AND s.push_enabled
   AND n.created_at>now()-interval '1 hour' AND n.push_attempts<5 AND n.push_state IN('pending','unconfigured','sending')
   AND(n.claim_until IS NULL OR n.claim_until<now()) FOR UPDATE OF n SKIP LOCKED`,[dedupe]);
  if(!notification)return null;
  await tx.unsafe("UPDATE public.notifications SET push_state='sending',push_attempts=push_attempts+1,claim_until=now()+interval '2 minutes' WHERE id=$1",[notification.id]);
  return notification;
 });
 if(!n)return;
 let state='pending';
 try{state=await deliverPushNotification(n);}
 finally{await rows('UPDATE public.notifications SET push_state=$2,claim_until=NULL WHERE id=$1',[n.id,state]);}
}
export function queueSocialPush(dedupe:string){
 if(!Deno.env.get('VAPID_PUBLIC_KEY')||!Deno.env.get('VAPID_PRIVATE_KEY'))return;
 const work=dispatchSocialPush(dedupe).catch(()=>console.error('social push delivery pending',{code:'PUSH_DELIVERY_FAILED'}));
 const runtime=(globalThis as any).EdgeRuntime;
 if(runtime?.waitUntil)runtime.waitUntil(work);
}

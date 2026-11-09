import {rateLimit,transaction,camel} from '../server/feature-db.ts';
import {queueSocialPush} from '../server/push-delivery.ts';
import {eligibilitySQL} from '../server/foundation.ts';
import {handle,json,requireProfile,body,HttpError,pairOf,publicProfile} from '../server/http.ts';

export default handle(async req=>{
 if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
 const {profile:me}=await requireProfile(req);
 await rateLimit(me.id,'swipe',120);
 const {targetId,liked}=await body(req);
 if(typeof liked!=='boolean')throw new HttpError(422,'Choose like or pass.');
 if(typeof targetId!=='string'||targetId===me.id)throw new HttpError(422,'Invalid member.');
 const [userA,userB]=pairOf(me.id,targetId);
 const response=await transaction(async tx=>{
  await tx.unsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[userA+':'+userB]);
  // Stabilize both preferences while authorizing and creating the connection.
  await tx.unsafe('SELECT id FROM public.profiles WHERE id IN($1,$2) ORDER BY id FOR UPDATE',[userA,userB]);
  const [target]=await tx.unsafe(`SELECT p.* FROM public.profiles p JOIN public.profiles v ON v.id=$1 WHERE p.id=$2 AND (${eligibilitySQL})`,[me.id,targetId]);
  if(!target)throw new HttpError(404,'That member is no longer available.');
  await tx.unsafe('INSERT INTO public.swipes(swiper_id,target_id,liked) VALUES($1,$2,$3) ON CONFLICT(swiper_id,target_id) DO UPDATE SET liked=excluded.liked',[me.id,targetId,liked]);
  if(!liked)return json({match:null});
  const [back]=await tx.unsafe('SELECT 1 FROM public.swipes WHERE swiper_id=$1 AND target_id=$2 AND liked',[targetId,me.id]);
  if(!back)return json({match:null});
  await tx.unsafe('INSERT INTO public.matches(user_a,user_b) VALUES($1,$2) ON CONFLICT DO NOTHING',[userA,userB]);
  const [match]=await tx.unsafe('SELECT id FROM public.matches WHERE user_a=$1 AND user_b=$2',[userA,userB]);
  return json({match:{id:match.id,other:publicProfile(camel(target))}});
 });
 if(liked){const result=await response.clone().json();if(result.match){queueSocialPush(`match:${result.match.id}:${userA}`);queueSocialPush(`match:${result.match.id}:${userB}`);}}
 return response;
});

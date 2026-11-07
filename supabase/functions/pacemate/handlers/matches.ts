import {handle,json,requireProfile,publicProfile,HttpError} from '../server/http.ts';
import {rows,transaction,camel,requireMatch} from '../server/feature-db.ts';
export default handle(async(req,ctx)=>{
  const {user}=await requireProfile(req);
  if(req.method==='GET'){
    const list=await rows(`SELECT m.id,m.created_at, p.*,
      (SELECT json_build_object('body',CASE WHEN msg.attachment_id IS NOT NULL AND msg.body='' THEN 'Photo' ELSE msg.body END,'mine',msg.sender_id=$1,'at',msg.created_at) FROM public.messages msg WHERE msg.match_id=m.id ORDER BY msg.id DESC LIMIT 1) AS last,
      (SELECT count(*)::int FROM public.messages msg WHERE msg.match_id=m.id AND msg.sender_id<>$1 AND msg.read_at IS NULL) AS unread,
      m.id AS match_id,m.created_at AS matched_at
      FROM public.matches m JOIN public.profiles p ON p.id=CASE WHEN m.user_a=$1 THEN m.user_b ELSE m.user_a END
      WHERE $1 IN(m.user_a,m.user_b) AND NOT p.suspended AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE(b.blocker_id=$1 AND b.blocked_id=p.id)OR(b.blocker_id=p.id AND b.blocked_id=$1))
      ORDER BY coalesce((SELECT max(created_at) FROM public.messages WHERE match_id=m.id),m.created_at) DESC`,[user.id]);
    return json({matches:list.map(m=>({id:m.match_id,createdAt:m.matched_at,other:publicProfile(camel(m)),last:m.last,unread:m.unread}))});
  }
  if(req.method==='DELETE'){
    const {match}=await requireMatch(req,Number(ctx.params.id));
    await transaction(async tx=>{
      const [a,b]=[match.user_a,match.user_b].sort();
      await tx.unsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a+':'+b]);
      await tx.unsafe('DELETE FROM public.matches WHERE id=$1 AND $2 IN(user_a,user_b)',[match.id,user.id]);
      await tx.unsafe('UPDATE public.swipes SET liked=false WHERE(swiper_id=$1 AND target_id=$2)OR(swiper_id=$2 AND target_id=$1)',[a,b]);
    });return json({ok:true});
  }
  throw new HttpError(405,'Method not allowed');
});

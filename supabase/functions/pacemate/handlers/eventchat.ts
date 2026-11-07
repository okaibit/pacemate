import {handle,json,body,str,HttpError} from '../server/http.ts';
import {rows,requireEvent,rateLimit} from '../server/feature-db.ts';
export default handle(async(req,ctx)=>{
  const id=Number(ctx.params.id),{user,event}=await requireEvent(req,id);
  if(req.method==='GET'){
    const after=Math.max(0,Number(new URL(req.url).searchParams.get('after'))||0);
    const messages=await rows(`SELECT m.id,m.body,m.created_at AS "createdAt",m.sender_id=$2 AS mine,p.name
      FROM public.event_messages m JOIN public.profiles p ON p.id=m.sender_id
      WHERE m.event_id=$1 AND m.id>$3 AND NOT p.suspended
      AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE(b.blocker_id=$2 AND b.blocked_id=m.sender_id)OR(b.blocker_id=m.sender_id AND b.blocked_id=$2)) ORDER BY m.id LIMIT 101`,[id,user.id,after]);
    const hasMore=messages.length>100;messages.splice(100);
    return json({event:{id,title:event.title},messages,hasMore,cursor:messages.at(-1)?.id||after});
  }
  if(req.method==='POST'){
    await rateLimit(user.id,'session-message',20);
    const text=str((await body(req)).body,2000,'Message',true);
    const [m]=await rows('INSERT INTO public.event_messages(event_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,body,created_at AS "createdAt"',[id,user.id,text]);
    return json({message:{...m,mine:true}},201);
  }
  throw new HttpError(405,'Method not allowed');
});

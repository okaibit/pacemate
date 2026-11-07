import {handle,json,body,str,HttpError,publicProfile} from '../server/http.ts';
import {rows,transaction,requireMatch,rateLimit,camel} from '../server/feature-db.ts';
import {signedPhoto} from '../server/supabase.ts';

export default handle(async(req,ctx)=>{
  const id=Number(ctx.params.id),{user,match}=await requireMatch(req,id);
  if(req.method==='GET'){
    const params=new URL(req.url).searchParams;
    const after=Math.max(0,Number(params.get('after'))||0);
    const list=await rows(`SELECT m.*,a.object_key FROM public.messages m LEFT JOIN public.chat_attachments a ON a.id=m.attachment_id
      WHERE m.match_id=$1 AND m.id>$2 ORDER BY m.id LIMIT 51`,[id,after]);
    const hasMore=list.length>50;list.splice(50);
    const [read]=await rows('SELECT last_read_id FROM public.match_reads WHERE match_id=$1 AND user_id=$2',[id,match.other_id]);
    let other;
    if(!after){const [p]=await rows('SELECT * FROM public.profiles WHERE id=$1',[match.other_id]);other=publicProfile(camel(p));}
    const messages=[];
    for(let start=0;start<list.length;start+=5)messages.push(...await Promise.all(list.slice(start,start+5).map(async m=>({id:m.id,body:m.body,mine:m.sender_id===user.id,createdAt:m.created_at,imageUrl:m.object_key?await signedPhoto('chat',m.object_key):null}))));
    return json({other,messages,hasMore,cursor:list.at(-1)?.id||after,otherReadId:read?.last_read_id||0});
  }
  if(req.method==='PUT'){
    const b=await body(req),requested=Number(b.lastReadId);
    if(!Number.isSafeInteger(requested)||requested<0)throw new HttpError(422,'Invalid read position.');
    // Do not let a caller acknowledge messages outside the selected match.
    const [last]=await rows('SELECT coalesce(max(id),0)::int AS id FROM public.messages WHERE match_id=$1 AND id<=$2',[id,requested]);
    await rows(`INSERT INTO public.match_reads(match_id,user_id,last_read_id) VALUES($1,$2,$3)
      ON CONFLICT(match_id,user_id) DO UPDATE SET last_read_id=greatest(match_reads.last_read_id,EXCLUDED.last_read_id)`,[id,user.id,last.id]);
    await rows('UPDATE public.messages SET read_at=now() WHERE match_id=$1 AND sender_id<>$2 AND id<=$3 AND read_at IS NULL',[id,user.id,last.id]);
    return json({ok:true});
  }
  if(req.method==='POST'){
    await rateLimit(user.id,'message',30);
    const b=await body(req),text=str(b.body,2000,'Message'),attachmentId=b.attachmentId||null;
    const clientId=b.clientId||null;
    if(clientId&&(typeof clientId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)))throw new HttpError(422,'Invalid message identity.');
    if(!text&&!attachmentId)throw new HttpError(422,'Write a message or choose a photo.');
    const [message]=await transaction(async tx=>{
      // Serialize against blocking/unmatching for this pair.
      const [a,c]=[match.user_a,match.user_b].sort();
      await tx.unsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a+':'+c]);
      const active=await tx.unsafe(`SELECT 1 FROM public.matches m WHERE m.id=$1 AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE(b.blocker_id=m.user_a AND b.blocked_id=m.user_b)OR(b.blocker_id=m.user_b AND b.blocked_id=m.user_a))`,[id]);
      if(!active.length)throw new HttpError(404,'This match is no longer available.');
      if(clientId){
        const existing=await tx.unsafe('SELECT * FROM public.messages WHERE sender_id=$1 AND client_id=$2',[user.id,clientId]);
        if(existing.length){if(existing[0].match_id!==id)throw new HttpError(422,'Message identity belongs to another conversation.');return existing;}
      }
      if(attachmentId){
        const attachment=await tx.unsafe(`SELECT 1 FROM public.chat_attachments a WHERE a.id=$1 AND a.user_id=$2 AND a.match_id=$3 AND NOT EXISTS(SELECT 1 FROM public.messages WHERE attachment_id=a.id)`,[attachmentId,user.id,id]);
        if(!attachment.length)throw new HttpError(422,'This photo is not available. Upload it again.');
      }
      return clientId
        ?tx.unsafe('INSERT INTO public.messages(match_id,sender_id,body,attachment_id,client_id) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,user.id,text,attachmentId,clientId])
        :tx.unsafe('INSERT INTO public.messages(match_id,sender_id,body,attachment_id) VALUES($1,$2,$3,$4) RETURNING *',[id,user.id,text,attachmentId]);
    });
    let imageUrl=null;
    if(message.attachment_id){const [a]=await rows('SELECT object_key FROM public.chat_attachments WHERE id=$1',[message.attachment_id]);if(a)imageUrl=await signedPhoto('chat',a.object_key);}
    return json({message:{id:message.id,body:message.body,mine:true,createdAt:message.created_at,imageUrl}},201);
  }
  throw new HttpError(405,'Method not allowed');
});

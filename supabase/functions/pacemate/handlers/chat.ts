import {handle,json,body,HttpError,publicProfile} from '../server/http.ts';
import {rows,requireMatch,rateLimit,camel} from '../server/feature-db.ts';
import {signedPhoto} from '../server/supabase.ts';
import {fetchPreview} from '../server/link-preview.js';
export default handle(async(req,ctx)=>{
 const id=Number(ctx.params.id),{user,match}=await requireMatch(req,id);
 if(req.method==='GET'){
  const imageParam=new URL(req.url).searchParams.get('images');
  if(imageParam!==null){const ids=imageParam.split(',').map(Number).filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,100),images:Record<string,string>={};
   if(ids.length){const attachments=await rows(`SELECT m.id,a.object_key FROM public.messages m JOIN public.chat_attachments a ON a.id=m.attachment_id WHERE m.match_id=$1 AND m.id=ANY($2::int[])`,[id,'{'+ids.join(',')+'}']);
    for(let i=0;i<attachments.length;i+=5)await Promise.all(attachments.slice(i,i+5).map(async a=>{images[a.id]=await signedPhoto('chat',a.object_key);}));}
   return json({images});
  }
  const [p]=await rows('SELECT * FROM public.profiles WHERE id=$1',[match.other_id]);return json({other:publicProfile(camel(p))});
 }
 if(req.method==='POST'){
  const b=await body(req),messageId=Number(b.messageId);if(!Number.isSafeInteger(messageId)||messageId<1)throw new HttpError(422,'Invalid message.');
  const [message]=await rows('SELECT * FROM public.messages WHERE id=$1 AND match_id=$2 AND sender_id=$3',[messageId,id,user.id]);
  if(!message)throw new HttpError(404,'Message not found.');
  if(message.link_url&&!message.link_meta){
   // Opt-in because metadata retrieval discloses the shared URL to a provider.
   if(Deno.env.get('PACEMATE_LINK_PREVIEWS')==='true'){
    await rateLimit(user.id,'link-preview',10);
    let metadata=null;try{metadata=await fetchPreview(message.link_url);}catch{}
    if(metadata){const [updated]=await rows('UPDATE public.messages SET link_meta=$1::jsonb WHERE id=$2 AND match_id=$3 AND sender_id=$4 RETURNING *',[JSON.stringify(metadata),messageId,id,user.id]);return json({message:updated});}
   }
  }
  return json({message});
 }
 throw new HttpError(405,'Method not allowed');
});

import {rows} from './feature-db.ts';
export async function repliesEnabled(){
 const [result]=await rows("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='reply_to_id')::int AS enabled");
 return Number(result?.enabled)===1;
}
export async function replyQuotes(matchId:number,ids:number[]){
 if(!ids.length)return {};
 const list=await rows(`SELECT m.id AS message_id,original.id,original.sender_id,left(original.body,240) AS body,
  CASE WHEN original.attachment_id IS NOT NULL THEN 'image' ELSE 'text' END AS type
  FROM public.messages m JOIN public.messages original ON original.id=(to_jsonb(m)->>'reply_to_id')::integer AND original.match_id=m.match_id
  WHERE m.match_id=$1 AND m.id=ANY($2::int[])`,[matchId,'{'+ids.join(',')+'}']);
 return Object.fromEntries(list.map(({message_id,...quote})=>[message_id,quote]));
}

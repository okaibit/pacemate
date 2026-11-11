import {ref,onBeforeUnmount} from 'vue';
import {pushRest,noteMessage} from './usePush.js';
import {session} from '../auth.js';
import {authClient,SUPABASE_URL,PUBLISHABLE_KEY} from '../supabase.js';
import {api,resizeImage} from '../api.js';
import {subscribe} from '../realtime.js';
import {firstLink,mergeMessages} from './chat-model.js';

export function useChat(conversationId,{mock=false}={}){
 const me=session.user?.id,other=ref(null),messages=ref([]),unread=ref(0),error=ref(''),loading=ref(false),hasOlder=ref(false),ready=ref(false);
 const canReply=ref(mock),muted=ref(false),archived=ref(false),intention=ref(null),legacy=ref(false);let stopPresence;
 let stopped=false,stop,timer,refreshing=false,refreshAgain=false,reading=false;
 const matchId=Number(conversationId);
 async function rest(path,{method='GET',body,prefer='return=representation',headers={}}={}){
  const auth=await authClient.getSession();
  if(auth?.user?.id!==me||stopped)throw new Error('Your account changed. Open this chat again.');
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json',Prefer:prefer,...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>null);
  if(stopped||(await authClient.getSession())?.user?.id!==me)throw new Error('Your account changed.');
  if(!response.ok)throw new Error(data?.code==='42703'||data?.code==='42P01'?'Chat database update is pending. Review and apply the separate chat migration.':data?.message||'Could not update this conversation.');
  return {data,range:response.headers.get('content-range')};
 }
 const put=list=>{if(!mock&&list.some(m=>Number.isSafeInteger(m.id)))noteMessage();if(!stopped)messages.value=mergeMessages(messages.value,list);};
 const putRows=list=>{if(!stopped&&list.some(m=>Number.isSafeInteger(m.id)&&Object.prototype.hasOwnProperty.call(m,'reply_to_id')))canReply.value=true;put(list);};
 async function reactions(){const saved=messages.value.filter(m=>Number.isSafeInteger(m.id));if(!saved.length)return;const all=[];for(let i=0;i<saved.length;i+=100){const {data}=await rest(`message_reactions?select=*&message_id=in.(${saved.slice(i,i+100).map(m=>m.id).join(',')})`);all.push(...data);}if(!stopped)messages.value=messages.value.map(m=>({...m,reactions:all.filter(r=>r.message_id===m.id)}));}
 async function countUnread(){const {range}=await rest(`messages?select=id&conversation_id=eq.${matchId}&sender_id=neq.${me}&read_at=is.null&limit=1`,{headers:{Prefer:'count=exact'}});unread.value=Number(range?.split('/')[1])||0;}
 async function older(){if(loading.value||stopped||mock)return;loading.value=true;
  try{const ids=messages.value.map(m=>m.id).filter(Number.isSafeInteger);const before=ids.length?`&id=lt.${Math.min(...ids)}`:'';const {data}=await rest(`messages?select=*&conversation_id=eq.${matchId}${before}&order=id.desc&limit=30`);hasOlder.value=data.length===30;putRows(data);await reactions();await images();await replies();}catch(e){if(!stopped)error.value=e.message;}finally{loading.value=false;}}
 async function replies(){const pending=messages.value.filter(m=>m.reply_to_id&&!m.reply&&Number.isSafeInteger(m.id));for(let i=0;i<pending.length;i+=100){const result=await api(`/api/matches/${matchId}/chat?replies=${pending.slice(i,i+100).map(m=>m.id).join(',')}`,{expectedUserId:me});if(!stopped)messages.value=messages.value.map(m=>({...m,reply:result.replies[m.id]||m.reply}));}}
 async function images(){const missing=messages.value.filter(m=>m.attachment_id);if(!missing.length)return;const urls={};for(let i=0;i<missing.length;i+=100){const result=await api(`/api/matches/${matchId}/chat?images=${missing.slice(i,i+100).map(m=>m.id).join(',')}`,{expectedUserId:me});Object.assign(urls,result.images);}if(!stopped)messages.value=messages.value.map(m=>({...m,imageUrl:urls[m.id]||m.imageUrl}));}
 async function refresh(change){
  if(stopped||mock||document.visibilityState!=='visible'||!ready.value)return;
  if(refreshing){refreshAgain=true;return;}refreshing=true;
  try{
   const membership=await rest(`conversations?select=id&id=eq.${matchId}`);if(!membership.data.length){messages.value=[];other.value=null;ready.value=false;stop?.();clearInterval(timer);throw new Error('This match is no longer available.');}
   // Re-fetch loaded rows as well as new ones: receipts can update an older bubble.
   const ids=messages.value.map(m=>m.id).filter(Number.isSafeInteger);
   for(let start=0;start<ids.length;start+=100){const {data}=await rest(`messages?select=*&conversation_id=eq.${matchId}&id=in.(${ids.slice(start,start+100).join(',')})`);putRows(data);}
   let after=ids.length?Math.max(...ids):0;
   for(let page=0;page<20;page++){const {data}=await rest(`messages?select=*&conversation_id=eq.${matchId}&id=gt.${after}&order=id.asc&limit=100`);putRows(data);if(data.length<100)break;after=data.at(-1).id;}
   await Promise.all([countUnread(),reactions(),images(),replies()]);error.value='';
  }catch(e){if(!stopped){error.value=e.message;}}
  finally{refreshing=false;if(refreshAgain&&!stopped){refreshAgain=false;refresh();}}
 }
 async function start(){
  if(mock){other.value={name:'Alex',photos:[]};messages.value=[{id:1,sender_id:'demo-other',body:'Hey! Ready for our next run? 🏃',created_at:new Date(Date.now()-180000).toISOString(),status:'sent',reactions:[{user_id:me,emoji:'👍'}]},{id:2,sender_id:me,body:'Absolutely! Same place tomorrow?',created_at:new Date(Date.now()-120000).toISOString(),read_at:new Date().toISOString(),status:'read'},{id:3,sender_id:'demo-other',type:'link',body:'A little inspiration for the route',link_url:'https://www.youtube.com/watch?v=example',link_meta:{title:'A new route. A fresh start.',image:new URL('/images/event.jpg',window.location.origin).href,logo:new URL('/app-icon.svg',window.location.origin).href,video:true,duration:'4:32'},created_at:new Date().toISOString(),status:'sent'}];return;}
  loading.value=true;
  try{
   const info=await api(`/api/matches/${matchId}/chat`,{expectedUserId:me});other.value=info.other;canReply.value=info.repliesEnabled===true;archived.value=info.archived===true;intention.value=info.intention??null;legacy.value=info.legacy===true;
   const membership=await rest(`conversations?select=id&id=eq.${matchId}`);if(!membership.data.length)throw new Error('This match is no longer available.');
   stopPresence=subscribe(`push:${me}`,()=>{},()=>{},undefined,{key:crypto.randomUUID(),state:()=>({conversation_id:matchId,visible:document.visibilityState==='visible'})});
   pushRest(`conversation_members?select=muted_until&conversation_id=eq.${matchId}&user_id=eq.${me}`).then(rows=>{muted.value=!!rows[0]?.muted_until&&Date.parse(rows[0].muted_until)>Date.now();}).catch(()=>{});
   ready.value=true;loading.value=false;await older();await countUnread();
   stop=subscribe(`match:${matchId}`,refresh,()=>{},[{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${matchId}`},{event:'UPDATE',schema:'public',table:'messages',filter:`conversation_id=eq.${matchId}`}]);
   timer=setInterval(refresh,15000);document.addEventListener('visibilitychange',refresh);
  }catch(e){if(!stopped)error.value=e.message;}finally{loading.value=false;}
 }
 async function enrich(message){if(!message.link_url||message.link_meta)return;try{const {message:updated}=await api(`/api/matches/${matchId}/chat`,{method:'POST',body:{messageId:message.id},expectedUserId:me});put([updated]);}catch{/* The link remains usable when preview retrieval fails. */}}
 async function deliver(optimistic,file){
  try{
   let saved;
   if(file){const existing=await rest(`messages?select=*&sender_id=eq.${me}&client_id=eq.${optimistic.client_id}`);if(existing.data.length){put(existing.data);await images();return;}const blob=await resizeImage(file);const {attachmentId}=await api(`/api/matches/${matchId}/attachments`,{method:'POST',body:blob,raw:'image/jpeg',expectedUserId:me});const result=await api(`/api/matches/${matchId}/messages`,{method:'POST',body:{body:optimistic.body,attachmentId,clientId:optimistic.client_id,replyToId:optimistic.reply_to_id||null},expectedUserId:me});saved={...optimistic,...result.message,id:result.message.id,status:'sent',created_at:result.message.createdAt,attachment_id:attachmentId};}
   else{
    // All sends pass through the authenticated API so committed messages queue push.
    try{const result=await api(`/api/matches/${matchId}/messages`,{method:'POST',body:{body:optimistic.body,clientId:optimistic.client_id,replyToId:optimistic.reply_to_id||null},expectedUserId:me});
     saved={...optimistic,...result.message,id:result.message.id,status:'sent',created_at:result.message.createdAt};
    }catch(error){const recovered=await rest(`messages?select=*&sender_id=eq.${me}&client_id=eq.${optimistic.client_id}`);if(!recovered.data.length)throw error;saved=recovered.data[0];}
   }
   put([saved]);enrich(saved);
  }catch(e){if(!stopped){put([{...optimistic,status:'failed',file}]);error.value=e.message;}}
 }
 function send(body,file,reply=null){body=body.trim();if(stopped||archived.value||(!body&&!file)||(!ready.value&&!mock))return false;if(reply&&(!canReply.value||!Number.isSafeInteger(reply.id)))return false;
  const client_id=crypto.randomUUID(),message={id:`local:${client_id}`,client_id,sender_id:me,body,reply_to_id:reply?.id||null,reply:reply?{id:reply.id,sender_id:reply.sender_id,body:reply.body?.slice(0,240)||'',type:reply.type}:null,type:file?'image':'text',link_url:file?null:firstLink(body),created_at:new Date().toISOString(),status:'sending',imageUrl:file?URL.createObjectURL(file):null};
  put([message]);if(message.imageUrl)objectUrls.push(message.imageUrl);if(mock){setTimeout(()=>put([{...message,id:Date.now(),status:'sent'}]),400);}else deliver(message,file);return true;
 }
 const objectUrls=[];
 async function markRead(ids){if(reading||mock||archived.value||stopped||document.visibilityState!=='visible')return;const selected=messages.value.filter(m=>ids.includes(m.id)&&m.sender_id!==me&&!m.read_at&&Number.isSafeInteger(m.id));if(!selected.length)return;reading=true;try{const lastReadId=Math.max(...selected.map(m=>m.id));await api(`/api/matches/${matchId}/messages`,{method:'PUT',body:{lastReadId},expectedUserId:me});await api('/api/notifications',{method:'PUT',body:{matchId},expectedUserId:me});await refresh();await countUnread();}catch(e){if(!stopped)error.value=e.message;}finally{reading=false;}}
 async function react(message){if(!Number.isSafeInteger(message.id)||archived.value)return;try{if(mock){put([{...message,reactions:message.reactions?.length?[]:[{user_id:me,emoji:'👍'}]}]);return;}await api(`/api/matches/${matchId}/chat`,{method:'POST',body:{action:'reaction',messageId:message.id,emoji:'👍'},expectedUserId:me});await reactions();}catch(e){if(!stopped)error.value=e.message;}}
 async function toggleMute(){if(archived.value)return;try{const result=await api(`/api/matches/${matchId}/chat`,{method:'POST',body:{action:'mute',muted:!muted.value},expectedUserId:me});muted.value=result.muted;}catch(e){error.value=e.message;}}
 async function unmatch(){await api(`/api/matches/${matchId}`,{method:'DELETE',expectedUserId:me});}
 function retry(message){put([{...message,status:'sending'}]);deliver(message,message.file);}
 onBeforeUnmount(()=>{stopped=true;stop?.();stopPresence?.();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);objectUrls.forEach(url=>URL.revokeObjectURL(url));});
 start();
 return {canReply,muted,archived,intention,legacy,toggleMute,me,other,messages,unread,error,loading,hasOlder,ready,older,send,markRead,react,retry,unmatch};
}

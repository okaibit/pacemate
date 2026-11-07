import {ref,onBeforeUnmount} from 'vue';
import {session} from '../auth.js';
import {authClient,SUPABASE_URL,PUBLISHABLE_KEY} from '../supabase.js';
import {api,resizeImage} from '../api.js';
import {subscribe} from '../realtime.js';
import {firstLink,mergeMessages} from './chat-model.js';

export function useChat(conversationId,{mock=false}={}){
 const me=session.user?.id,other=ref(null),messages=ref([]),unread=ref(0),error=ref(''),loading=ref(false),hasOlder=ref(false),ready=ref(false);
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
 const put=list=>{if(!stopped)messages.value=mergeMessages(messages.value,list);};
 async function reactions(){const saved=messages.value.filter(m=>Number.isSafeInteger(m.id));if(!saved.length)return;const all=[];for(let i=0;i<saved.length;i+=100){const {data}=await rest(`message_reactions?select=*&message_id=in.(${saved.slice(i,i+100).map(m=>m.id).join(',')})`);all.push(...data);}if(!stopped)messages.value=messages.value.map(m=>({...m,reactions:all.filter(r=>r.message_id===m.id)}));}
 async function countUnread(){const {range}=await rest(`messages?select=id&conversation_id=eq.${matchId}&sender_id=neq.${me}&read_at=is.null&limit=1`,{headers:{Prefer:'count=exact'}});unread.value=Number(range?.split('/')[1])||0;}
 async function older(){if(loading.value||stopped||mock)return;loading.value=true;
  try{const ids=messages.value.map(m=>m.id).filter(Number.isSafeInteger);const before=ids.length?`&id=lt.${Math.min(...ids)}`:'';const {data}=await rest(`messages?select=*&conversation_id=eq.${matchId}${before}&order=id.desc&limit=30`);hasOlder.value=data.length===30;put(data);await reactions();await images();}catch(e){if(!stopped)error.value=e.message;}finally{loading.value=false;}}
 async function images(){const missing=messages.value.filter(m=>m.attachment_id);if(!missing.length)return;const urls={};for(let i=0;i<missing.length;i+=100){const result=await api(`/api/matches/${matchId}/chat?images=${missing.slice(i,i+100).map(m=>m.id).join(',')}`,{expectedUserId:me});Object.assign(urls,result.images);}if(!stopped)messages.value=messages.value.map(m=>({...m,imageUrl:urls[m.id]||m.imageUrl}));}
 async function refresh(change){
  if(stopped||mock||document.visibilityState!=='visible'||!ready.value)return;
  if(refreshing){refreshAgain=true;return;}refreshing=true;
  try{
   const membership=await rest(`conversations?select=id&id=eq.${matchId}`);if(!membership.data.length){messages.value=[];other.value=null;ready.value=false;stop?.();clearInterval(timer);throw new Error('This match is no longer available.');}
   // Re-fetch loaded rows as well as new ones: receipts can update an older bubble.
   const ids=messages.value.map(m=>m.id).filter(Number.isSafeInteger);
   for(let start=0;start<ids.length;start+=100){const {data}=await rest(`messages?select=*&conversation_id=eq.${matchId}&id=in.(${ids.slice(start,start+100).join(',')})`);put(data);}
   let after=ids.length?Math.max(...ids):0;
   for(let page=0;page<20;page++){const {data}=await rest(`messages?select=*&conversation_id=eq.${matchId}&id=gt.${after}&order=id.asc&limit=100`);put(data);if(data.length<100)break;after=data.at(-1).id;}
   await Promise.all([countUnread(),reactions(),images()]);error.value='';
  }catch(e){if(!stopped){error.value=e.message;}}
  finally{refreshing=false;if(refreshAgain&&!stopped){refreshAgain=false;refresh();}}
 }
 async function start(){
  if(mock){other.value={name:'Alex',photos:[]};messages.value=[{id:1,sender_id:'demo-other',body:'Hey! Ready for our next run? 🏃',created_at:new Date(Date.now()-180000).toISOString(),status:'sent',reactions:[{user_id:me,emoji:'👍'}]},{id:2,sender_id:me,body:'Absolutely! Same place tomorrow?',created_at:new Date(Date.now()-120000).toISOString(),read_at:new Date().toISOString(),status:'read'},{id:3,sender_id:'demo-other',type:'link',body:'A little inspiration for the route',link_url:'https://www.youtube.com/watch?v=example',link_meta:{title:'A new route. A fresh start.',image:new URL('/images/event.jpg',window.location.origin).href,logo:new URL('/app-icon.svg',window.location.origin).href,video:true,duration:'4:32'},created_at:new Date().toISOString(),status:'sent'}];return;}
  loading.value=true;
  try{
   const info=await api(`/api/matches/${matchId}/chat`,{expectedUserId:me});other.value=info.other;
   const membership=await rest(`conversations?select=id&id=eq.${matchId}`);if(!membership.data.length)throw new Error('This match is no longer available.');
   ready.value=true;loading.value=false;await older();await countUnread();
   stop=subscribe(`match:${matchId}`,refresh,()=>{},[{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${matchId}`},{event:'UPDATE',schema:'public',table:'messages',filter:`conversation_id=eq.${matchId}`}]);
   timer=setInterval(refresh,15000);document.addEventListener('visibilitychange',refresh);
  }catch(e){if(!stopped)error.value=e.message;}finally{loading.value=false;}
 }
 async function enrich(message){if(!message.link_url||message.link_meta)return;try{const {message:updated}=await api(`/api/matches/${matchId}/chat`,{method:'POST',body:{messageId:message.id},expectedUserId:me});put([updated]);}catch{/* The link remains usable when preview retrieval fails. */}}
 async function deliver(optimistic,file){
  try{
   let saved;
   if(file){const existing=await rest(`messages?select=*&sender_id=eq.${me}&client_id=eq.${optimistic.client_id}`);if(existing.data.length){put(existing.data);await images();return;}const blob=await resizeImage(file);const {attachmentId}=await api(`/api/matches/${matchId}/attachments`,{method:'POST',body:blob,raw:'image/jpeg',expectedUserId:me});const result=await api(`/api/matches/${matchId}/messages`,{method:'POST',body:{body:optimistic.body,attachmentId,clientId:optimistic.client_id},expectedUserId:me});saved={...optimistic,...result.message,id:result.message.id,status:'sent',created_at:result.message.createdAt,attachment_id:attachmentId};}
   else{
    // client_id gives a retry the same identity after a lost HTTP response.
    const existing=await rest(`messages?select=*&sender_id=eq.${me}&client_id=eq.${optimistic.client_id}`);
    if(existing.data.length)saved=existing.data[0];else{try{const {data}=await rest('messages',{method:'POST',body:{conversation_id:matchId,match_id:matchId,sender_id:me,type:optimistic.link_url?'link':'text',body:optimistic.body,link_url:optimistic.link_url||null,client_id:optimistic.client_id}});saved=data[0];}catch(e){const recovered=await rest(`messages?select=*&sender_id=eq.${me}&client_id=eq.${optimistic.client_id}`);if(!recovered.data.length)throw e;saved=recovered.data[0];}}
   }
   put([saved]);enrich(saved);
  }catch(e){if(!stopped){put([{...optimistic,status:'failed',file}]);error.value=e.message;}}
 }
 function send(body,file){body=body.trim();if(stopped||(!body&&!file)||(!ready.value&&!mock))return false;
  const client_id=crypto.randomUUID(),message={id:`local:${client_id}`,client_id,sender_id:me,body,type:file?'image':'text',link_url:file?null:firstLink(body),created_at:new Date().toISOString(),status:'sending',imageUrl:file?URL.createObjectURL(file):null};
  put([message]);if(message.imageUrl)objectUrls.push(message.imageUrl);if(mock){setTimeout(()=>put([{...message,id:Date.now(),status:'sent'}]),400);}else deliver(message,file);return true;
 }
 const objectUrls=[];
 async function markRead(ids){if(reading||mock||stopped||document.visibilityState!=='visible')return;const selected=messages.value.filter(m=>ids.includes(m.id)&&m.sender_id!==me&&!m.read_at&&Number.isSafeInteger(m.id));if(!selected.length)return;reading=true;try{const {data}=await rest(`messages?conversation_id=eq.${matchId}&sender_id=neq.${me}&read_at=is.null&id=in.(${selected.map(m=>m.id).slice(0,100).join(',')})`,{method:'PATCH',body:{read_at:new Date().toISOString()}});put(data);await countUnread();}catch(e){if(!stopped)error.value=e.message;}finally{reading=false;}}
 async function react(message){if(!Number.isSafeInteger(message.id))return;try{if(mock){put([{...message,reactions:message.reactions?.length?[]:[{user_id:me,emoji:'👍'}]}]);return;}const mine=message.reactions?.some(r=>r.user_id===me);await rest(mine?`message_reactions?message_id=eq.${message.id}&user_id=eq.${me}`:'message_reactions',{method:mine?'DELETE':'POST',body:mine?undefined:{message_id:message.id,user_id:me,emoji:'👍'}});await reactions();}catch(e){if(!stopped)error.value=e.message;}}
 async function unmatch(){await api(`/api/matches/${matchId}`,{method:'DELETE',expectedUserId:me});}
 function retry(message){put([{...message,status:'sending'}]);deliver(message,message.file);}
 onBeforeUnmount(()=>{stopped=true;stop?.();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);objectUrls.forEach(url=>URL.revokeObjectURL(url));});
 start();
 return {me,other,messages,unread,error,loading,hasOlder,ready,older,send,markRead,react,retry,unmatch};
}

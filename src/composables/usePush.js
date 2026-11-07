import {ref,computed} from 'vue';
import {authClient,SUPABASE_URL,PUBLISHABLE_KEY} from '../supabase.js';
import {api} from '../api.js';
export const supported=!!(window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window);
export const iosHomeHint=/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
export const needsHomeScreen=iosHomeHint&&!navigator.standalone&&!matchMedia('(display-mode: standalone)').matches;
let configuredKey=import.meta.env.VITE_VAPID_PUBLIC_KEY||'',keyRequest;
const enabled=ref(false),eligible=ref(false),dismissed=ref(false),error=ref(''),busy=ref(false);
export async function pushRest(path,{method='GET',body}={}){
 const session=await authClient.getSession();if(!session)throw new Error('Please sign in.');
 const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.message||'Could not save notification settings.');return data;
}
const bytes=key=>Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(key.length/4)*4,'=')),c=>c.charCodeAt(0));
export async function syncPush(){
 if(!supported)return;const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager.getSubscription();
 enabled.value=!!sub&&!!(await pushRest(`push_subscriptions?select=id&endpoint=eq.${encodeURIComponent(sub.endpoint)}`)).length;
}
export async function enablePush(publicKey){
 if(!supported||needsHomeScreen)throw new Error('Add Pacemate to your Home Screen to enable notifications (iOS 16.4+).');
 // Obtain configuration before prompting; this function is only called by a tap.
 const key=publicKey||configuredKey;
 if(!key)throw new Error('Push delivery is not configured yet.');
 if(await Notification.requestPermission()!=='granted')throw new Error('Allow notifications in your browser settings to enable them.');
 await navigator.serviceWorker.register('/sw.js');const reg=await navigator.serviceWorker.ready;
 const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(key)});
 const current=await authClient.getSession();const json=sub.toJSON();
 const existing=await pushRest(`push_subscriptions?select=id&endpoint=eq.${encodeURIComponent(sub.endpoint)}`);
 if(!existing.length)await pushRest('push_subscriptions',{method:'POST',body:{user_id:current.user.id,endpoint:sub.endpoint,p256dh:json.keys.p256dh,auth:json.keys.auth,user_agent:navigator.userAgent.slice(0,500)}});
 enabled.value=true;dismissed.value=true;
}
export async function disablePush(){
 if(!('serviceWorker' in navigator))return;const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager?.getSubscription();
 if(sub){await pushRest(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,{method:'DELETE'});await sub.unsubscribe();}
 enabled.value=false;
}
export function noteMessage(){if(!keyRequest&&!configuredKey)keyRequest=api('/api/settings').then(s=>{configuredKey=s.pushKey||'';}).catch(()=>{}).finally(()=>{eligible.value=true;});else eligible.value=true;}
export function usePush(){return {enabled,error,busy,supported,needsHomeScreen,showPrompt:computed(()=>eligible.value&&!dismissed.value&&!enabled.value&&(supported||needsHomeScreen)),dismiss:()=>{dismissed.value=true;},enable:async()=>{busy.value=true;error.value='';try{await enablePush();}catch(e){error.value=e.message;}finally{busy.value=false;}}};}
authClient.onChange((event,user)=>{if(!user){enabled.value=false;eligible.value=false;dismissed.value=false;}else syncPush().catch(()=>{});});

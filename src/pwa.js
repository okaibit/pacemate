import {ref} from 'vue';
import {api} from './api.js';
export const installAvailable=ref(false);
let installEvent;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;installAvailable.value=true;});
window.addEventListener('appinstalled',()=>{installEvent=null;installAvailable.value=false;});
export async function installApp(){if(!installEvent)return;await installEvent.prompt();await installEvent.userChoice;installEvent=null;installAvailable.value=false;}
export async function registerWorker(){if('serviceWorker'in navigator)return navigator.serviceWorker.register('/sw.js');}
const bytes=key=>Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(key.length/4)*4,'=')),c=>c.charCodeAt(0));
export async function enablePush(publicKey){
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error('Push notifications are unavailable in this browser.');
  if(!publicKey)throw new Error('Push delivery is not configured yet.');
  if(await Notification.requestPermission()!=='granted')throw new Error('Notifications were not allowed. You can change this in browser settings.');
  await registerWorker();const registration=await navigator.serviceWorker.ready;
  const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});
  await api('/api/notifications/push',{method:'POST',body:subscription.toJSON()});
}
export async function disablePush(){
  if(!('serviceWorker'in navigator))return;
  const registration=await navigator.serviceWorker.getRegistration();
  const subscription=await registration?.pushManager?.getSubscription();
  if(subscription){await api('/api/notifications/push',{method:'DELETE',body:{endpoint:subscription.endpoint}});await subscription.unsubscribe();}
}

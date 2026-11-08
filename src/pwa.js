import {ref} from 'vue';
const displayMode=window.matchMedia?.('(display-mode: standalone)');
export const appInstalled=ref(!!(displayMode?.matches||navigator.standalone));
export const appleMobile=/iPad|iPhone|iPod/.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
export const installAvailable=ref(false),installBusy=ref(false);
let installEvent;
function installed(){appInstalled.value=true;installEvent=null;installAvailable.value=false;}
window.addEventListener('beforeinstallprompt',event=>{
 if(appInstalled.value)return;
 event.preventDefault();installEvent=event;installAvailable.value=true;
});
window.addEventListener('appinstalled',installed);
const modeChanged=event=>{appInstalled.value=!!(event.matches||navigator.standalone);if(appInstalled.value)installed();};
if(displayMode?.addEventListener)displayMode.addEventListener('change',modeChanged);
else displayMode?.addListener?.(modeChanged);
export async function installApp(){
 if(!installEvent||appInstalled.value||installBusy.value)return {outcome:'unavailable'};
 const event=installEvent;installEvent=null;installAvailable.value=false;installBusy.value=true;
 try{await event.prompt();return await event.userChoice;}
 finally{installBusy.value=false;}
}
export async function registerWorker(){if('serviceWorker'in navigator)return navigator.serviceWorker.register('/sw.js');}
export {enablePush,disablePush} from './composables/usePush.js';

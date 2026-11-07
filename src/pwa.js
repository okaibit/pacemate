import {ref} from 'vue';
export const installAvailable=ref(false);
let installEvent;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;installAvailable.value=true;});
window.addEventListener('appinstalled',()=>{installEvent=null;installAvailable.value=false;});
export async function installApp(){if(!installEvent)return;await installEvent.prompt();await installEvent.userChoice;installEvent=null;installAvailable.value=false;}
export async function registerWorker(){if('serviceWorker'in navigator)return navigator.serviceWorker.register('/sw.js');}
export {enablePush,disablePush} from './composables/usePush.js';

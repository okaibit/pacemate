// Home Screen badges are separate from the notification icon's image.
export async function setUnreadAppBadge(count,nav=globalThis.navigator){
 if(!Number.isSafeInteger(count)||count<0)return;
 try{
  if(count===0&&typeof nav?.clearAppBadge==='function')await nav.clearAppBadge();
  else if(typeof nav?.setAppBadge==='function')await nav.setAppBadge(count);
 }catch{/* OS permission and unsupported platforms must not interrupt the app. */}
}

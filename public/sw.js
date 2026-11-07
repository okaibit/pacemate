const CACHE='pacemate-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/app-icon.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('pacemate-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never cache authenticated HTML, API responses, private photos or wellness data.
  if(url.origin===self.location.origin&&event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
});
self.addEventListener('push',event=>{
  let data;try{data=event.data.json()||{};}catch{data={};}
  event.waitUntil(self.registration.showNotification(data.title||'Pacemate',{body:data.body||'',icon:'/icon-192.png',badge:'/icon-192.png',tag:data.tag||'pacemate',data:{href:data.conversationId ? `/chat/${encodeURIComponent(data.conversationId)}` : data.href||'/app/notifications'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  let url;try{url=new URL(event.notification.data?.href||'/app/notifications',self.location.origin);}catch{return;}
  if(url.origin!==self.location.origin)return;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    for(const client of clients){if(new URL(client.url).origin===url.origin){await client.navigate(url.href);return client.focus();}}
    return self.clients.openWindow(url.href);
  }));
});

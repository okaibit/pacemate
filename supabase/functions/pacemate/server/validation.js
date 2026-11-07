export const cityKey = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function distanceKm(a,b) {
  const rad = n=>n*Math.PI/180;
  const dlat=rad(b.latitude-a.latitude),dlon=rad(b.longitude-a.longitude);
  const h=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function validPushSubscription(value) {
  try {
    const u=new URL(value.endpoint);
    const allowed=u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.notify.windows.com')||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.apple.com');
    return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&allowed&&value.endpoint.length<2048&&/^[A-Za-z0-9_-]{80,180}$/.test(value.keys?.p256dh||'')&&/^[A-Za-z0-9_-]{16,64}$/.test(value.keys?.auth||'');
  } catch { return false; }
}
export const internalHref = value => typeof value==='string'&&value.startsWith('/app/')&&!value.includes('\\')&&!value.startsWith('//')?value:'/app/notifications';
export async function verifyStripeSignature(body,header,secret,now=Date.now()) {
  if (!header||!secret) return false;
  const parts=header.split(',').map(p=>p.split('='));
  const stamp=parts.find(p=>p[0]==='t')?.[1];
  if (!/^\d+$/.test(stamp||'')||Math.abs(now/1000-Number(stamp))>300) return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const mac=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${stamp}.${body}`)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  return parts.filter(p=>p[0]==='v1').some(([,sig])=>{if(sig?.length!==mac.length)return false;let mismatch=0;for(let i=0;i<mac.length;i++)mismatch|=mac.charCodeAt(i)^sig.charCodeAt(i);return mismatch===0;});
}

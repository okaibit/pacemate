// Only the fixed metadata provider is fetched. Never fetch arbitrary member URLs
// from the Edge Function, follow their redirects, or expose response HTML.
export function publicLink(value){
 try{const u=new URL(value),host=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.port||u.href.length>2048||u.hash)return null;
 if(!host.includes('.')||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.localhost')||host.endsWith('.test')||host.endsWith('.invalid')||host.endsWith('.example')||host.endsWith('.supabase.co')||host.includes(':')||/^\d+(\.\d+){3}$/.test(host))return null;
 if([...u.searchParams.keys()].some(k=>/token|key|secret|signature|password|auth|code/i.test(k)))return null;
 return u.href;}catch{return null;}
}
function remoteImage(value){return publicLink(value);}
export function cleanPreview(data,url){const text=(v,n)=>typeof v==='string'?v.slice(0,n):null;
 return {title:text(data?.title,200)||new URL(url).hostname,description:text(data?.description,350),image:remoteImage(data?.image?.url),logo:remoteImage(data?.logo?.url),video:!!data?.video,duration:typeof data?.video?.duration==='number'?`${Math.floor(data.video.duration/60)}:${String(Math.floor(data.video.duration%60)).padStart(2,'0')}`:null};
}
export async function fetchPreview(url){const safe=publicLink(url);if(!safe)return null;
 const headers={};const key=Deno.env.get('MICROLINK_API_KEY');if(key)headers['x-api-key']=key;
 const response=await fetch('https://api.microlink.io/?'+new URLSearchParams({url:safe}),{headers,redirect:'error',signal:AbortSignal.timeout(7000)});
 if(!response.ok)return null;
 const reader=response.body?.getReader();if(!reader)return null;let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256*1024){await reader.cancel();return null;}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let payload;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{return null;}
 return payload.status==='success'?cleanPreview(payload.data,safe):null;
}

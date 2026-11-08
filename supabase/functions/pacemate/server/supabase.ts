const base = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Never accept a decoded JWT or a user id supplied by the browser as proof of identity.
const users = new WeakMap<Request, Promise<any>>();
export function getUser(req: Request) {
  let result = users.get(req);
  if (!result) { result = verifyUser(req); users.set(req, result); }
  return result;
}

async function verifyUser(req: Request) {
  const bearer = req.headers.get("Authorization");
  if (!bearer?.startsWith("Bearer ")) return null;
  const response = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: bearer }, signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Authentication service unavailable");
  return await response.json();
}

async function adminRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...options.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabase operation failed (${response.status})`);
  return response;
}

export async function deleteIdentity(id: string) {
  await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

const objectPath = (key: string) => key.split("/").map(encodeURIComponent).join("/");
export async function storePhoto(key: string, data: Uint8Array, contentType: string) {
  await adminRequest(`/storage/v1/object/photos/${objectPath(key)}`, {
    method: "POST", headers: { "Content-Type": contentType }, body: data.slice().buffer,
  });
}
export async function deletePhotos(keys: string[]) {
  if (keys.length) await adminRequest("/storage/v1/object/photos", { method: "DELETE", body: JSON.stringify({ prefixes: keys }) });
}
export async function removeUserPhotos(id: string) {
  for(const bucket of ['photos','chat','verification']){
    for(;;){
      const response=await adminRequest(`/storage/v1/object/list/${bucket}`,{method:'POST',body:JSON.stringify({prefix:id,limit:100,offset:0})});
      const files=await response.json();if(!files.length)break;
      // Chat uploads use a flat user prefix so listing never returns folders.
      const keys=files.filter((file:any)=>file.id).map((file:any)=>`${id}/${file.name}`);
      if(!keys.length)break;
      await adminRequest(`/storage/v1/object/${bucket}`,{method:'DELETE',body:JSON.stringify({prefixes:keys})});
    }
  }
}

export async function uploadPrivate(bucket: string,key: string,data: Uint8Array,type: string) {
  await adminRequest(`/storage/v1/object/${bucket}/${objectPath(key)}`,{method:"POST",headers:{"Content-Type":type},body:data.slice().buffer});
}
export async function signedPhoto(bucket: string,key: string,expiresIn=60) {
  const response=await adminRequest(`/storage/v1/object/sign/${bucket}/${objectPath(key)}`,{method:"POST",body:JSON.stringify({expiresIn})});
  const data=await response.json();
  return `${base}/storage/v1${data.signedURL}`;
}
export async function deletePrivate(bucket: string,keys: string[]) {
  if(keys.length)await adminRequest(`/storage/v1/object/${bucket}`,{method:"DELETE",body:JSON.stringify({prefixes:keys})});
}
export async function setIdentityBan(id: string,suspended: boolean) {
  await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify({ban_duration:suspended?"876000h":"none"})});
}
export async function readImage(req: Request) {
  if (Number(req.headers.get('content-length')||0)>2097152) throw new Error('IMAGE_TOO_LARGE');
  const reader=req.body?.getReader();if(!reader)throw new Error('IMAGE_INVALID');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2097152){await reader.cancel();throw new Error('IMAGE_TOO_LARGE');}chunks.push(value);}
  if(!size)throw new Error('IMAGE_INVALID');
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  let ext='';
  if(data[0]===255&&data[1]===216&&data[2]===255)ext='jpg';
  if(data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71&&data[4]===13&&data[5]===10&&data[6]===26&&data[7]===10)ext='png';
  if(String.fromCharCode(...data.slice(0,4))==='RIFF'&&String.fromCharCode(...data.slice(8,12))==='WEBP')ext='webp';
  if(!ext)throw new Error('IMAGE_INVALID');
  return {data,ext,type:ext==='jpg'?'image/jpeg':`image/${ext}`};
}

// app_metadata can only be written by trusted Auth administration, unlike user_metadata.
export function hasAdultTermsAcknowledgement(user: any) {
  const value = user?.app_metadata?.pacemate_adult_terms_accepted_at;
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export async function acknowledgeAdultTerms(user: any, accepted: unknown) {
  if (accepted !== true) throw new Error("Confirm you are 18 or older and accept the terms.");
  if (hasAdultTermsAcknowledgement(user)) return user.app_metadata.pacemate_adult_terms_accepted_at;
  const timestamp = new Date().toISOString();
  await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: "PUT", body: JSON.stringify({ app_metadata: { ...user.app_metadata, pacemate_adult_terms_accepted_at: timestamp } }),
  });
  return timestamp;
}

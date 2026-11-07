// Keep transport separate from Vue so token ownership and public responses are testable.
export function createFoundationClient({url,key,auth,fetchImpl=fetch}) {
 return async function rpc(name,args={},expectedUserId) {
  const session=await auth.getSession();
  if(!session?.access_token)throw new Error('Please sign in again.');
  if(expectedUserId&&session.user?.id!==expectedUserId)throw new Error('Your account changed. Refresh this page.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try {
   const response=await fetchImpl(`${url}/rest/v1/rpc/${name}`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(args)});
   const result=await response.json().catch(()=>{throw new Error('The server returned an unexpected response. Please retry.');});
   if(expectedUserId&&(await auth.getSession())?.user?.id!==expectedUserId)throw new Error('Your account changed. Refresh this page.');
   if(!response.ok){
    if(result?.code==='PGRST202'||result?.code==='42883')throw new Error('Profile setup is awaiting the Foundation database migration.');
    throw new Error(['22023','23514','42501'].includes(result?.code)?result.message:'Could not load or save this profile. Please retry.');
   }
   return result;
  }catch(e){if(e.name==='AbortError')throw new Error('The request timed out. Please retry.');throw e;}
  finally{clearTimeout(timer);}
 };
}

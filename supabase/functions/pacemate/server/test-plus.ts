// Server-only switches. A client preference, query parameter or location never grants Plus.
export function testPlusUsers():string[]{
 if(Deno.env.get('PACEMATE_ENV')!=='test'||Deno.env.get('PACEMATE_TEST_PLUS_ENABLED')!=='true')return [];
 const ref=Deno.env.get('PACEMATE_TEST_PROJECT_REF');
 if(!ref||!/^[a-z0-9]{20}$/.test(ref)||Deno.env.get('SUPABASE_URL')!==`https://${ref}.supabase.co`)return [];
 return (Deno.env.get('PACEMATE_TEST_PLUS_USERS')||'').split(',').map(id=>id.trim()).filter(Boolean);
}
export const testPlusAllowed=(userId:string)=>testPlusUsers().includes(userId);

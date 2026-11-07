// Run once. Never prints or persists the private key. Requires Supabase CLI login.
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const project=process.argv[2];
if(!project||!process.env.VAPID_SUBJECT)throw new Error('Usage: VAPID_SUBJECT=mailto:you@example.com node scripts/setup-push-secrets.mjs PROJECT_REF');
const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=privateKey.export({format:'jwk'});
const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
const webhookSecret=randomBytes(32).toString('hex');
const directory=mkdtempSync(join(tmpdir(),'pacemate-push-'));
try{
 const file=join(directory,'secrets.env');writeFileSync(file,`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${jwk.d}\nVAPID_SUBJECT=${process.env.VAPID_SUBJECT}\nPUSH_WEBHOOK_SECRET=${webhookSecret}\n`,{mode:0o600});
 const cli=process.env.SUPABASE_CLI;
 const result=spawnSync(cli||'npx',[...(cli?[]:['--yes','supabase@2.39.2']),'secrets','set','--project-ref',project,'--env-file',file],{stdio:'inherit',timeout:60000});
 if(result.status!==0)throw new Error('Secrets upload failed. Resolve CLI access and run again.');
 writeFileSync('.env.push-webhook',`PUSH_WEBHOOK_SECRET=${webhookSecret}\n`,{mode:0o600});
 console.log(`Secrets stored. Public key (safe for VITE_VAPID_PUBLIC_KEY): ${publicKey}`);
 console.log('Copy the shared token from ignored .env.push-webhook to Vault push_webhook_secret, then delete that local file.');
}finally{rmSync(directory,{recursive:true,force:true});}

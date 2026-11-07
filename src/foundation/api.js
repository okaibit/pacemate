import {authClient,SUPABASE_URL,PUBLISHABLE_KEY} from '../supabase.js';
import {createFoundationClient} from './client.js';
export const foundationRpc=createFoundationClient({url:SUPABASE_URL,key:PUBLISHABLE_KEY,auth:authClient});

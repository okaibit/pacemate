import {handle,json,requireProfile,readBodyText,HttpError} from '../server/http.ts';
import {rows,transaction,plusMember,rateLimit} from '../server/feature-db.ts';
import {verifyStripeSignature} from '../server/validation.js';
import {allowedOrigin} from '../routes.js';

async function stripe(path:string,method='GET',values?:Record<string,string>,idempotency?:string){
  const key=Deno.env.get('STRIPE_SECRET_KEY');
  if(!key)throw new HttpError(503,'Billing is not configured.');
  const response=await fetch('https://api.stripe.com/v1'+path,{method,headers:{Authorization:`Bearer ${key}`,...(idempotency?{'Idempotency-Key':idempotency}:{}),...(values?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:values?new URLSearchParams(values):undefined,signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!response.ok)throw new HttpError(502,'The payment service is unavailable. Try again later.');
  return data;
}
export default handle(async(req,ctx)=>{
  const action=ctx.params.action||'config';
  if(action==='webhook'){
    if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
    if(!req.headers.get('stripe-signature')||!Deno.env.get('STRIPE_WEBHOOK_SECRET'))throw new HttpError(400,'Invalid webhook signature.');
    const raw=await readBodyText(req,1000000);
    if(raw.length>1000000||!await verifyStripeSignature(raw,req.headers.get('stripe-signature'),Deno.env.get('STRIPE_WEBHOOK_SECRET')))throw new HttpError(400,'Invalid webhook signature.');
    let event;try{event=JSON.parse(raw);}catch{throw new HttpError(400,'Invalid webhook body.');}
    if(!['checkout.session.completed','customer.subscription.updated','customer.subscription.deleted','customer.subscription.created'].includes(event.type))return json({received:true});
    const object=event.data?.object;
    const subscriptionId=event.type==='checkout.session.completed'?object?.subscription:object?.id;
    if(typeof subscriptionId!=='string'||!subscriptionId.startsWith('sub_'))throw new HttpError(400,'Missing subscription.');
    const subscription=event.type==='customer.subscription.deleted'?object:await stripe('/subscriptions/'+encodeURIComponent(subscriptionId));
    const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id;
    const [owner]=await rows('SELECT user_id FROM public.billing_customers WHERE customer_id=$1',[customer]);
    if(!owner){
      const memberId=subscription.metadata?.pacemate_user_id;
      if(!memberId||!(await rows('SELECT 1 FROM public.profiles WHERE id=$1',[memberId])).length)return json({received:true});
      throw new HttpError(409,'Customer mapping is not available. Retry this event.');
    }
    const price=Deno.env.get('STRIPE_PRICE_ID');
    const matchesPrice=subscription.items?.data?.some((item:any)=>item.price?.id===price);
    const period=subscription.current_period_end||subscription.items?.data?.[0]?.current_period_end;
    const status=event.type==='customer.subscription.deleted'?'canceled':matchesPrice?subscription.status:'unsupported';
    await transaction(async tx=>{
      const inserted=await tx.unsafe('INSERT INTO public.billing_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[event.id]);
      if(!inserted.length)return;
      await tx.unsafe(`INSERT INTO public.subscriptions(user_id,subscription_id,status,current_period_end,last_event_at) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(user_id) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,status=EXCLUDED.status,current_period_end=EXCLUDED.current_period_end,last_event_at=EXCLUDED.last_event_at,updated_at=now()
        WHERE subscriptions.last_event_at<=EXCLUDED.last_event_at AND(EXCLUDED.status<>'canceled' OR subscriptions.subscription_id=EXCLUDED.subscription_id)`,[owner.user_id,subscriptionId,status,period?new Date(period*1000).toISOString():null,event.created]);
    });return json({received:true});
  }
  const {user}=await requireProfile(req);
  const enabled=Deno.env.get('BILLING_ENABLED')==='true'&&!!Deno.env.get('STRIPE_SECRET_KEY')&&!!Deno.env.get('STRIPE_PRICE_ID')&&!!Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if(action==='config'&&req.method==='GET'){
    const active=await plusMember(user.id);
    let price=null;
    if(enabled){const p=await stripe('/prices/'+encodeURIComponent(Deno.env.get('STRIPE_PRICE_ID')!));if(p.active&&p.recurring&&p.billing_scheme==='per_unit'&&Number.isSafeInteger(p.unit_amount)&&p.unit_amount>0)price={amount:p.unit_amount,currency:p.currency,interval:p.recurring.interval,intervalCount:p.recurring.interval_count};}
    const hasCustomer=(await rows('SELECT 1 FROM public.billing_customers WHERE user_id=$1',[user.id])).length>0;
    return json({enabled:enabled&&!!price,active,price,hasCustomer});
  }
  if(!enabled)throw new HttpError(503,'Premium subscriptions are not enabled.');
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
  await rateLimit(user.id,'billing',5,3600);
  const origin=req.headers.get('origin')||Deno.env.get('PACEMATE_APP_URL')||'https://pacematess.netlify.app';
  if(!allowedOrigin(origin,Deno.env.get('PACEMATE_ALLOWED_ORIGINS')))throw new HttpError(403,'Invalid return origin.');
  let [customer]=await rows('SELECT customer_id FROM public.billing_customers WHERE user_id=$1',[user.id]);
  if(!customer){
    // Database serialization prevents duplicate customers from concurrent clicks.
    customer=await transaction(async tx=>{
      await tx.unsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['billing:'+user.id]);
      const [existing]=await tx.unsafe('SELECT customer_id FROM public.billing_customers WHERE user_id=$1',[user.id]);
      if(existing)return existing;
      const c=await stripe('/customers','POST',{email:user.email,'metadata[pacemate_user_id]':user.id},'customer:'+user.id);
      const [created]=await tx.unsafe('INSERT INTO public.billing_customers(user_id,customer_id) VALUES($1,$2) RETURNING customer_id',[user.id,c.id]);return created;
    });
  }
  if(action==='portal'){
    const portal=await stripe('/billing_portal/sessions','POST',{customer:customer.customer_id,return_url:origin+'/app/settings'});return json({url:portal.url});
  }
  if(action==='checkout'){
    if(await plusMember(user.id))throw new HttpError(409,'Your subscription is already active.');
    const checkout=await transaction(async tx=>{
      await tx.unsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['checkout:'+user.id]);
      const [pending]=await tx.unsafe('SELECT url FROM public.billing_checkout_sessions WHERE user_id=$1 AND expires_at>now()',[user.id]);
      if(pending)return pending;
      const current=await stripe('/subscriptions?customer='+encodeURIComponent(customer.customer_id)+'&status=all&limit=10');
      if(current.data?.some((s:any)=>['active','trialing','past_due','unpaid'].includes(s.status)))throw new HttpError(409,'You already have a subscription. Open Manage subscription.');
      const checkout=await stripe('/checkout/sessions','POST',{customer:customer.customer_id,mode:'subscription','line_items[0][price]':Deno.env.get('STRIPE_PRICE_ID')!,'line_items[0][quantity]':'1','subscription_data[metadata][pacemate_user_id]':user.id,success_url:origin+'/app/settings?checkout=success',cancel_url:origin+'/app/settings?checkout=cancelled',client_reference_id:user.id,expires_at:String((Math.floor(Date.now()/1800000)+2)*1800)},'checkout:'+user.id+':'+new URL(origin).host+':'+Math.floor(Date.now()/1800000));
      await tx.unsafe('INSERT INTO public.billing_checkout_sessions(user_id,session_id,url,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET session_id=EXCLUDED.session_id,url=EXCLUDED.url,expires_at=EXCLUDED.expires_at',[user.id,checkout.id,checkout.url,new Date(checkout.expires_at*1000).toISOString()]);
      return checkout;
    });
    return json({url:checkout.url});
  }
  throw new HttpError(404,'Not found');
});


export async function cancelMemberSubscription(userId:string){
  const [subscription]=await rows("SELECT subscription_id FROM public.subscriptions WHERE user_id=$1 AND status NOT IN('canceled','incomplete_expired')",[userId]);
  if(!subscription)return;
  await stripe('/subscriptions/'+encodeURIComponent(subscription.subscription_id),'DELETE');
  await rows("UPDATE public.subscriptions SET status='canceled',current_period_end=now(),updated_at=now() WHERE user_id=$1",[userId]);
}

import {handle,json,requireProfile,requireUser,body,HttpError} from '../server/http.ts';
import {rows,transaction,plusMember,rateLimit,camel} from '../server/feature-db.ts';
import {COUNTRIES,CURRENCIES,countryCode} from '../money/config.js';
import {selectPrices} from '../money/pricing.js';
import {testPlusAllowed} from '../server/test-plus.ts';

async function preferences(userId:string){const [p]=await rows('SELECT * FROM public.billing_preferences WHERE user_id=$1',[userId]);return p?{countryCode:p.country_code,displayCurrency:p.display_currency,billingCountry:p.billing_country}:null;}
export default handle(async(req,ctx)=>{
 const action=ctx.params.action||'config';
 if(['checkout','portal','cancel','sync','webhook'].includes(action))throw new HttpError(410,'Payments are disabled. No payment provider is connected.');
 let user,profile;
 if(['config','history'].includes(action)){user=await requireUser(req);const [p]=await rows('SELECT country_code FROM public.profiles WHERE id=$1',[user.id]);profile={countryCode:p?.country_code};}
 else ({user,profile}=await requireProfile(req));
 if(action==='preferences'){
  if(req.method==='GET')return json({preferences:await preferences(user.id),countries:COUNTRIES,currencies:Object.values(CURRENCIES)});
  if(req.method!=='PUT')throw new HttpError(405,'Method not allowed');
  const b=await body(req),country=countryCode(b.countryCode),billingCountry=b.billingCountry===null?null:countryCode(b.billingCountry);
  if(!country||!Object.hasOwn(CURRENCIES,b.displayCurrency)||b.billingCountry!=null&&!billingCountry)throw new HttpError(422,'Choose a supported country and display currency.');
  await rows(`INSERT INTO public.billing_preferences(user_id,country_code,display_currency,billing_country) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET country_code=EXCLUDED.country_code,display_currency=EXCLUDED.display_currency,billing_country=EXCLUDED.billing_country,updated_at=now()`,[user.id,country,b.displayCurrency,billingCountry]);
  return json({preferences:{countryCode:country,displayCurrency:b.displayCurrency,billingCountry}});
 }
 if(action==='history'&&req.method==='GET'){
  const offset=Number(new URL(req.url).searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>10000000)throw new HttpError(422,'Invalid payment history position.');
  const result=await rows('SELECT invoice_reference,transaction_reference,subscription_id,currency,amount_minor,status,paid_at,period_end,refunded_minor,receipt_url,created_at FROM public.payments WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $2',[user.id,offset]);const hasMore=result.length>50;return json({payments:result.slice(0,50).map(camel),hasMore,nextOffset:offset+50});
 }

 if(action==='test-access'){
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
  if(!testPlusAllowed(user.id))throw new HttpError(403,'Test membership controls are not available for this account.');
  const b=await body(req);
  if(!['free','plus'].includes(b.membership)||Object.keys(b).some(k=>k!=='membership'))throw new HttpError(422,'Choose Free or Plus. No other fields are accepted.');
  await rateLimit(user.id,'billing:test-access',20);
  await transaction(async tx=>{
   await tx.unsafe('SELECT id FROM public.profiles WHERE id=$1 FOR UPDATE',[user.id]);
   const [existing]=await tx.unsafe('SELECT * FROM public.subscriptions WHERE user_id=$1',[user.id]);
   if(existing&&existing.provider!=='test')throw new HttpError(409,'An existing paid subscription cannot be replaced by test access.');
   if(b.membership==='free'){
    await tx.unsafe("UPDATE public.subscriptions SET status='canceled',paid_through=now(),current_period_end=now(),cancelled_at=now(),updated_at=now() WHERE user_id=$1 AND provider='test'",[user.id]);
   }else{
    await tx.unsafe(`INSERT INTO public.subscriptions(user_id,subscription_id,provider,plan_id,status,started_at,paid_through,current_period_end,cancel_at_period_end)
     VALUES($1,$2,'test','plus','active',now(),now()+interval '24 hours',now()+interval '24 hours',true)
     ON CONFLICT(user_id) DO UPDATE SET status='active',started_at=now(),paid_through=now()+interval '24 hours',current_period_end=now()+interval '24 hours',cancelled_at=NULL,updated_at=now()
     WHERE subscriptions.provider='test'`,[user.id,'testplus_'+crypto.randomUUID()]);
   }
  });
  return json({active:await plusMember(user.id),testAccess:true});
 }
 if(action==='config'&&req.method==='GET'){
  await rateLimit(user.id,'billing:config',30);
  const saved=await preferences(user.id),query=new URL(req.url).searchParams,requested=query.get('country');
  if(requested&&!countryCode(requested))throw new HttpError(422,'Choose a supported billing country.');
  const country=countryCode(requested)||saved?.billingCountry||saved?.countryCode||countryCode(profile.countryCode)||countryCode(query.get('hintCountry'))||'NG';
  const prices=selectPrices(await rows('SELECT * FROM public.regional_prices WHERE country_code=$1 AND environment=$2',[country,'test']),country).map(p=>({id:p.id,amount:String(p.amount_minor),currency:p.currency,interval:p.billing_interval,intervalCount:1,available:false}));
  const [subscription]=await rows('SELECT * FROM public.subscriptions WHERE user_id=$1',[user.id]);
  const testAccess=testPlusAllowed(user.id);
  return json({paymentAvailability:'disabled',enabled:false,active:await plusMember(user.id),testAccess,prices,price:null,country,preferences:saved,hasCustomer:false,subscription:subscription&&(subscription.provider!=='test'||testAccess)?camel(subscription):null});
 }
 throw new HttpError(405,'Method not allowed');
});
export async function cancelMemberSubscription(userId:string){
 const [s]=await rows('SELECT * FROM public.subscriptions WHERE user_id=$1',[userId]);
 if(s&&s.provider!=='test'&&!['canceled','incomplete_expired'].includes(s.status))throw new HttpError(409,'An existing provider subscription must be cancelled before deleting this account. Payments are currently disconnected.');
}

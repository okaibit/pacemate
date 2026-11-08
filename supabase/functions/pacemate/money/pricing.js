import {countryCode,currencyInfo} from './public.js';
// Region and currency never imply approval. Every offer is an explicit versioned record.
export function selectPrices(prices,country,now=new Date()){
 const code=countryCode(country);if(!code)return [];
 const valid=prices.filter(p=>p.country_code===code&&p.plan_id==='plus'&&p.approved===true&&p.active===true&&['week','month','year'].includes(p.billing_interval)&&p.interval_count===1&&Number.isFinite(Date.parse(p.effective_from))&&Date.parse(p.effective_from)<=+now&&(!p.effective_until||Date.parse(p.effective_until)>+now));
 const latest=new Map();for(const p of valid){try{currencyInfo(p.currency);}catch{continue;}if(!/^\d+$/.test(String(p.amount_minor))||BigInt(p.amount_minor)<=0n)continue;const key=p.currency+':'+p.billing_interval;const previous=latest.get(key);if(!previous||Date.parse(p.effective_from)>Date.parse(previous.effective_from))latest.set(key,p);}
 return [...latest.values()];
}
export function verifyProviderPrice(price,offer){
 return price?.id===offer.provider_price_id&&price.active===true&&price.billing_scheme==='per_unit'&&price.type==='recurring'&&price.recurring?.interval===offer.billing_interval&&price.recurring?.interval_count===1&&price.currency?.toUpperCase()===offer.currency&&String(price.unit_amount)===String(offer.provider_amount)&&!price.transform_quantity&&!price.custom_unit_amount;
}

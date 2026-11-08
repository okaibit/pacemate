import approved from '../supabase/functions/pacemate/money/plus-launch-prices.json' with {type:'json'};
import {COUNTRIES,COUNTRY_BY_CODE,countryCode,detectCountry,formatMoney} from './money.js';
export function planCountry(profile={},languages){
 const code=countryCode(profile?.countryCode||profile?.country_code);
 if(code)return code;
 const named=COUNTRIES.find(c=>c.name.toLowerCase()===String(profile?.country||'').toLowerCase());
 if(named)return named.code;
 // Legacy profiles can have a city but no country. Never use nextCity/travel destinations.
 const city=String(profile?.currentCity||'').trim().toLowerCase();
 if(['lagos','abuja','port harcourt'].includes(city))return 'NG';
 if(['new york','los angeles','san francisco','san diego','seattle','portland','denver','austin','houston','dallas','chicago','atlanta','miami','boston','washington dc','nashville'].includes(city))return 'US';
 return detectCountry(languages)||'NG';
}
export function planCards(country,serverPrices=[]){
 const regional=approved.filter(p=>p.country===country);
 if(!regional.length)return serverPrices.filter(p=>['week','month','year'].includes(p.interval)&&p.intervalCount===1).map(p=>({...p,country,weeklyAmount:null,header:p.interval==='month'?'Popular':p.interval==='week'?'Standard rate':'Annual'}));
 return regional.map(p=>{
  // Do not attach a purchasable ID from an older price with a different amount.
  const matched=serverPrices.find(s=>s.currency===p.currency&&s.interval===p.interval&&s.intervalCount===1&&String(s.amount)===p.amount);
  return {...p,id:matched?.id||`plus-${country.toLowerCase()}-${p.interval}-v2`,intervalCount:1,available:matched?.available===true};
 });
}
export function planRate(plan){return plan.weeklyAmount===null?formatMoney(plan.amount,plan.currency,{locale:COUNTRY_BY_CODE[plan.country]?.locale||'en'})+'/'+plan.interval:formatMoney(plan.weeklyAmount,plan.currency,{locale:plan.country==='NG'?'en-NG':'en-US'})+'/wk';}
export function planCta(plan){return plan?'Enjoy 1 '+plan.interval+' for '+formatMoney(plan.amount,plan.currency,{locale:plan.country==='NG'?'en-NG':'en-US'}):'Choose a plan';}

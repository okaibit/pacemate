import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COUNTRIES,COUNTRY_BY_CODE,CURRENCIES,HISTORICAL_CURRENCIES,detectCountry,resolvePreferences,formatMoney,decimalToMinor,stripeToMinor,minorToStripe,formatRecurring} from '../src/money.js';
import {readMoneyPreferences,saveMoneyPreferences} from '../src/money-preferences.js';
import {selectPrices,verifyProviderPrice} from '../supabase/functions/pacemate/money/pricing.js';
import {contractFromSubscription,invoicePayment,entitled} from '../supabase/functions/pacemate/money/contracts.js';
const expected='DZ AO BJ BW CM CI CD EG ET GH KE LR MG MU MA MZ NA NG RW SN SL ZA TZ TG TN UG ZM ZW AT BE BG HR CZ DK EE FI FR GE DE GR HU IS IE IT LV LT NL NO PL PT RO RS ES SE CH TR UA GB BH IL JO KW LB OM QA SA AE BD CN HK IN ID JP KZ MY NP PK PH SG KR LK TW TH UZ VN CA MX US AR BB BR CL CO CR CU DO EC JM PA PE PR TT UY AU FJ NZ'.split(' ');
test('all 106 requested ISO countries and territories occur exactly once with valid locales and currencies',()=>{
 assert.equal(COUNTRIES.length,106);assert.deepEqual(COUNTRIES.map(c=>c.code).sort(),expected.sort());
 const names=new Intl.DisplayNames(['en'],{type:'region',fallback:'none'});
 for(const country of COUNTRIES){assert.ok(names.of(country.code));assert.ok(CURRENCIES[country.currency]);assert.ok(country.symbol);assert.ok(Intl.NumberFormat.supportedLocalesOf([country.locale]).length);assert.equal(country.paymentAvailability,'unconfigured');}
});
test('current country currency assignments include adoptions, territories and shared currencies',()=>{
 const mappings={NG:'NGN',US:'USD',BG:'EUR',HR:'EUR',SL:'SLE',ZW:'ZWG',HK:'HKD',TW:'TWD',PR:'USD',EC:'USD',PA:'PAB',CI:'XOF',BJ:'XOF',SN:'XOF',TG:'XOF',CM:'XAF',CD:'CDF',MG:'MGA',FJ:'FJD',GE:'GEL'};
 for(const [code,currency] of Object.entries(mappings))assert.equal(COUNTRY_BY_CODE[code].currency,currency);
 assert.equal(COUNTRY_BY_CODE.FR.currency,COUNTRY_BY_CODE.DE.currency);assert.equal(HISTORICAL_CURRENCIES.BGN.supported,false);assert.equal(HISTORICAL_CURRENCIES.SLL.replacement,'SLE');
});
test('ISO zero, two and three decimal money formatting preserves integer precision',()=>{
 assert.equal(formatMoney('150000','NGN',{locale:'en-NG',compactWhole:true}),'₦1,500');
 assert.equal(formatMoney(299,'USD',{locale:'en-US'}),'$2.99');assert.equal(formatMoney(1200000,'NGN',{locale:'en-NG',compactWhole:true}),'₦12,000');
 assert.equal(formatMoney(1234,'JPY',{locale:'en-US'}),'¥1,234');assert.match(formatMoney(1234,'KWD'),/1.234/);
 assert.match(formatMoney('900719925474099301','USD'),/9,007,199,254,740,993.01/);
 assert.equal(formatMoney(-1,'USD'),'-$0.01');assert.equal(decimalToMinor('2.99','USD'),'299');assert.equal(decimalToMinor('1.234','BHD'),'1234');
 for(const call of [()=>formatMoney(1.2,'USD'),()=>formatMoney(3,'ZZZ'),()=>formatMoney(3,'SLL'),()=>decimalToMinor('2.999','USD'),()=>decimalToMinor('1.2','JPY')])assert.throws(call);
 assert.match(formatMoney(1234,'EUR',{locale:'de-DE'}),/12,34/);
});
test('Stripe representations are explicitly distinct from ISO precision',()=>{
 for(const c of ['ISK','UGX']){assert.equal(CURRENCIES[c].decimals,0);assert.equal(stripeToMinor(150000,c),'1500');assert.equal(minorToStripe('1500',c),150000);assert.throws(()=>stripeToMinor(101,c));}
 assert.equal(CURRENCIES.BHD.decimals,3);assert.equal(minorToStripe(1230,'BHD'),1230);assert.throws(()=>minorToStripe(1234,'BHD'));
 assert.equal(stripeToMinor(1,'MGA'),'100');assert.throws(()=>minorToStripe(101,'MGA'));
});
test('country hints are optional, manual choices persist, unknown detection defaults to NGN',()=>{
 assert.equal(detectCountry(['invalid_thing','en','en-GB']),'GB');assert.equal(detectCountry(['en']),null);
 assert.deepEqual(resolvePreferences({},[]),{countryCode:'NG',displayCurrency:'NGN',billingCountry:null});
 assert.deepEqual(resolvePreferences({countryCode:'FR',displayCurrency:'JPY',billingCountry:'US'},['en-NG']),{countryCode:'FR',displayCurrency:'JPY',billingCountry:'US'});
 const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
 saveMoneyPreferences('a',{countryCode:'US',displayCurrency:'KWD',billingCountry:'NG'},storage);
 assert.equal(readMoneyPreferences('a',storage,['fr-FR']).displayCurrency,'KWD');assert.equal(readMoneyPreferences('b',storage,[]).countryCode,'NG');
});
const offer={id:'us-v1',country_code:'US',plan_id:'plus',currency:'USD',billing_interval:'month',interval_count:1,amount_minor:'299',provider_price_id:'price_us',provider_amount:299,approved:true,active:true,effective_from:'2026-11-08T00:00:00Z'};
test('regional pricing is explicit, active, approved, effective and independent across shared currencies',()=>{
 const future={...offer,id:'future',amount_minor:'399',effective_from:'2027-01-01T00:00:00Z'};
 assert.equal(selectPrices([offer,future],'US',new Date('2026-12-01'))[0].id,'us-v1');assert.equal(selectPrices([offer,future],'US',new Date('2027-01-01'))[0].id,'future');
 assert.deepEqual(selectPrices([offer],'GB'),[]);
 for(const patch of [{active:false},{approved:false},{effective_until:'2026-11-09T00:00:00Z'},{currency:'ZZZ'}])assert.deepEqual(selectPrices([{...offer,...patch}],'US',new Date('2026-12-01')),[]);
 const france={...offer,id:'fr',country_code:'FR',currency:'EUR',amount_minor:'599'},germany={...france,id:'de',country_code:'DE',amount_minor:'699'};
 assert.equal(selectPrices([france,germany],'FR')[0].amount_minor,'599');assert.equal(selectPrices([france,germany],'DE')[0].amount_minor,'699');
});
test('only the four approved launch amounts are seeded per environment; annual display is the full total',()=>{
 const sql=readFileSync('supabase/migrations/20261108010000_global_billing.sql','utf8');
 for(const [country,currency,interval,amount] of [['NG','NGN','month',150000],['NG','NGN','year',1200000],['US','USD','month',299],['US','USD','year',2499]])assert.equal(sql.split(`'${country}','${currency}','${interval}',${amount},true,true`).length-1,2);
 assert.equal((sql.match(/true,true,'(?:test|live)'/g)||[]).length,8);
 assert.match(formatRecurring({amount:2499,currency:'USD',interval:'year',intervalCount:1}),/24.99 USD \/ year/);
});
const remotePrice={id:'price_us',active:true,type:'recurring',currency:'usd',unit_amount:299,billing_scheme:'per_unit',recurring:{interval:'month',interval_count:1}};
const sub={id:'sub_verified',customer:'cus_owner',status:'active',items:{data:[{price:remotePrice,quantity:1}]}};
const invoice={id:'in_paid',customer:'cus_owner',subscription:sub.id,currency:'usd',amount_due:299,total:299,amount_paid:299,status:'paid',lines:{data:[{price:remotePrice,quantity:1,period:{start:1793491200,end:1796083200}}]},status_transitions:{paid_at:1793491200}};
const charge={id:'ch_verified',customer:'cus_owner',invoice:invoice.id,amount:299,currency:'usd',paid:true,status:'succeeded',amount_refunded:0,disputed:false};
const contract=()=>contractFromSubscription(sub,offer,null);
test('provider price, invoice identity, amount and currency must all match',()=>{
 assert.ok(verifyProviderPrice(remotePrice,offer));assert.equal(invoicePayment(invoice,sub,contract(),charge).status,'paid');
 for(const patch of [{unit_amount:298},{currency:'eur'},{recurring:{interval:'year',interval_count:1}}])assert.equal(verifyProviderPrice({...remotePrice,...patch},offer),false);
 for(const patch of [{amount_due:300},{currency:'eur'},{customer:'cus_other'},{subscription:'sub_other'},{amount_paid:298},{paid_out_of_band:true}])assert.throws(()=>invoicePayment({...invoice,...patch},sub,contract(),charge));
 assert.throws(()=>invoicePayment(invoice,sub,contract(),{...charge,amount:1}));assert.throws(()=>invoicePayment(invoice,sub,contract(),null));assert.throws(()=>invoicePayment(invoice,sub,contract(),{...charge,amount_refunded:-1}));
});
test('subscription contracts retain their original amount and currency across new offers',()=>{
 const locked=contract();assert.equal(contractFromSubscription(sub,{...offer,amount_minor:'999'},locked).amount_minor,'299');
 assert.throws(()=>contractFromSubscription({...sub,items:{data:[{price:{...remotePrice,currency:'eur'},quantity:1}]}},offer,locked));
 assert.throws(()=>contractFromSubscription({...sub,items:{data:[{price:{...remotePrice,unit_amount:999},quantity:1}]}},offer,locked));
});
test('pending, failed, void, uncollectible, refunded and disputed payment states do not grant access',()=>{
 for(const status of ['open','void','uncollectible']){const p=invoicePayment({...invoice,status,amount_paid:0,attempted:false},sub,contract(),null);assert.notEqual(p.status,'paid');}
 assert.equal(invoicePayment({...invoice,status:'open',attempted:true},sub,contract(),null).status,'failed');
 assert.equal(invoicePayment(invoice,sub,contract(),{...charge,amount_refunded:299}).status,'refunded');assert.equal(invoicePayment(invoice,sub,contract(),{...charge,disputed:true}).status,'disputed');
 assert.equal(invoicePayment(invoice,sub,contract(),{...charge,amount_refunded:100}).status,'paid');
});
test('verified paid-through access expires, survives end-of-period cancellation, and restores after renewal',()=>{
 const now=Date.parse('2026-11-08'),s={plan_id:'plus',status:'active',paid_through:'2026-12-01T00:00:00Z'};
 assert.equal(entitled(s,now),true);assert.equal(entitled({...s,status:'canceled'},now),true);assert.equal(entitled({...s,status:'past_due'},now),true);
 assert.equal(entitled({...s,paid_through:'2026-11-01'},now),false);assert.equal(entitled({...s,status:'trialing'},now),false);assert.equal(entitled({...s,paid_through:null},now),false);
 assert.equal(entitled({...s,paid_through:'2027-01-01'},Date.parse('2026-12-15')),true);
});
test('migration prepares RLS, unique transaction IDs and immutable contracts without deleting downgrade data',()=>{
 const sql=readFileSync('supabase/migrations/20261108010000_global_billing.sql','utf8');assert.match(sql,/UNIQUE\(provider,transaction_reference\)/);assert.match(sql,/UNIQUE\(provider,invoice_reference\)/);assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.match(sql,/OLD.amount_minor IS NOT NULL/);assert.match(sql,/\(s\).paid_through>now\(\)/);assert.ok(!/DELETE FROM|DROP TABLE|TRUNCATE/i.test(sql));
});

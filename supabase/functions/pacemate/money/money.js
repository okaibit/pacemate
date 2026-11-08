import {CURRENCIES,HISTORICAL_CURRENCIES} from './config.js';
export function currencyInfo(currency,historical=false){const code=String(currency).toUpperCase();const info=CURRENCIES[code]||(historical?HISTORICAL_CURRENCIES[code]:null);if(!info)throw new Error('Unsupported currency.');return info;}
export function minorUnits(value){if(typeof value==='number'&&!Number.isSafeInteger(value)||typeof value!=='number'&&typeof value!=='bigint'&&!(typeof value==='string'&&/^-?\d+$/.test(value)))throw new Error('Money must be integer minor units.');return BigInt(value);}
export function formatMoney(amount,currency,{locale='en',historical=false,compactWhole=false}={}){
 const info=currencyInfo(currency,historical),value=minorUnits(amount),negative=value<0n,n=negative?-value:value,scale=10n**BigInt(info.decimals),whole=n/scale,fraction=(n%scale).toString().padStart(info.decimals,'0');
 const digits=compactWhole&&n%scale===0n?0:info.decimals;
 const formatter=new Intl.NumberFormat(locale,{style:'currency',currency:info.code,minimumFractionDigits:digits,maximumFractionDigits:digits});
 // Format the integer portion as BigInt, replacing only the fractional digits. No float division.
 const parts=formatter.formatToParts(negative?-whole:whole).map(p=>p.type==='fraction'?fraction:p.value);
 if(negative&&whole===0n)return formatter.formatToParts(-1n).map(p=>p.type==='integer'?'0':p.type==='fraction'?fraction:p.value).join('');
 return parts.join('');
}
export function decimalToMinor(value,currency){
 const {decimals}=currencyInfo(currency);if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value))throw new Error('Enter a decimal string.');
 const [whole,fraction='']=value.split('.');if(fraction.length>decimals)throw new Error('Too many decimal places.');return (BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0')).toString();
}
// Stripe's ISK and UGX are two-decimal representations; MGA charges use zero decimals.
export function stripeToMinor(amount,currency){
 const info=currencyInfo(currency),providerDecimals=['ISK','UGX'].includes(info.code)?2:info.code==='MGA'?0:info.decimals;
 const value=minorUnits(amount),delta=info.decimals-providerDecimals;
 if(delta>=0)return (value*10n**BigInt(delta)).toString();
 const divisor=10n**BigInt(-delta);if(value%divisor)throw new Error('Invalid provider fractional amount.');return (value/divisor).toString();
}
export function minorToStripe(amount,currency){
 const info=currencyInfo(currency),providerDecimals=['ISK','UGX'].includes(info.code)?2:info.code==='MGA'?0:info.decimals;
 const value=minorUnits(amount),delta=providerDecimals-info.decimals,divisor=10n**BigInt(Math.abs(delta));
 if(delta<0&&value%divisor)throw new Error('Unsupported provider precision.');
 const result=delta>=0?value*divisor:value/divisor;
 if(result<0n||result>BigInt(Number.MAX_SAFE_INTEGER)||providerDecimals===3&&result%10n)throw new Error('Unsupported provider amount.');return Number(result);
}
export function formatRecurring(price,locale='en'){
 if(!price||!['day','week','month','year'].includes(price.interval)||!Number.isInteger(price.intervalCount)||price.intervalCount<1)return '';
 if(minorUnits(price.amount)<=0n)return '';
 const currency=String(price.currency).toUpperCase();
 return `${formatMoney(price.amount,currency,{locale,historical:true,compactWhole:currency==='NGN'})} ${currency} / ${price.intervalCount===1?price.interval:price.intervalCount+' '+price.interval+'s'}`;
}

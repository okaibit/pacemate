import countryData from './countries.json' with {type:'json'};
// ISO 4217 precision, reviewed 2026-11-08. Provider representation is separate.
const codes='NGN USD GBP EUR GHS ZAR KES EGP MAD XOF XAF CAD MXN BRL ARS CLP COP AUD NZD JPY CNY HKD INR IDR MYR SGD PHP KRW THB PKR BDT NPR LKR KZT UZS AED SAR QAR KWD BHD OMR JOD ILS LBP TRY CHF DKK NOK SEK PLN CZK HUF RON UAH RSD ISK XCD TTD JMD BBD DOP PAB CRC PEN UYU BWP AOA DZD ETB MUR MZN NAD RWF SLE TND UGX ZMW ZWG XPF CDF LRD MGA TZS GEL TWD VND CUP FJD';
const zero=new Set('XOF XAF CLP JPY KRW ISK RWF UGX XPF VND'.split(' '));
const three=new Set('KWD BHD OMR JOD TND'.split(' '));
export const CURRENCIES=Object.freeze(Object.fromEntries(codes.split(' ').map(code=>[code,Object.freeze({code,decimals:zero.has(code)?0:three.has(code)?3:2,supported:true,symbol:new Intl.NumberFormat(countryData.find(c=>c.currency===code)?.locale||'en',{style:'currency',currency:code}).formatToParts(0).find(p=>p.type==='currency').value})])));
export const HISTORICAL_CURRENCIES=Object.freeze({BGN:{code:'BGN',decimals:2,supported:false,replacement:'EUR'},SLL:{code:'SLL',decimals:2,supported:false,replacement:'SLE'}});
export const COUNTRIES=Object.freeze(countryData.map(c=>Object.freeze({...c,symbol:CURRENCIES[c.currency].symbol,regionalPricing:'explicit-configuration-required'})));
export const COUNTRY_BY_CODE=Object.freeze(Object.fromEntries(COUNTRIES.map(c=>[c.code,c])));
export function countryCode(value){const code=String(value||'').toUpperCase();return Object.hasOwn(COUNTRY_BY_CODE,code)?code:null;}
export function detectCountry(languages=globalThis.navigator?.languages||[]){
 for(const language of languages){try{const code=countryCode(new Intl.Locale(language).region);if(code)return code;}catch{}}
 return null;
}
export function resolvePreferences(saved={},languages){
 const country=countryCode(saved.countryCode)||detectCountry(languages)||'NG';
 return {countryCode:country,displayCurrency:Object.hasOwn(CURRENCIES,saved.displayCurrency)?saved.displayCurrency:COUNTRY_BY_CODE[country].currency,billingCountry:countryCode(saved.billingCountry)};
}

import {formatRecurring} from './money.js';
export function formatPlusPrice(price,locale='en'){try{return formatRecurring(price,locale);}catch{return '';}}
export function paymentDestination(){throw new Error('Payments are disabled. No payment provider is connected.');}
export function receiptDestination(value){try{const u=new URL(value);return u.protocol==='https:'&&['invoice.stripe.com','pay.stripe.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}}

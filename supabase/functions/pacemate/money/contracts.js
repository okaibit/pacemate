import {stripeToMinor,minorToStripe} from './money.js';
export function contractFromSubscription(subscription,offer,locked){
 const items=subscription.items?.data;if(items?.length!==1||items[0].quantity!==1)throw new Error('Unsupported subscription items.');
 const price=items[0].price;
 const contract=locked?.amount_minor?locked:{plan_id:'plus',provider:'stripe',price_id:offer?.provider_price_id,currency:offer?.currency,amount_minor:String(offer?.amount_minor||''),billing_interval:offer?.billing_interval,billing_country:offer?.country_code};
 if(!contract.price_id||price.id!==contract.price_id||price.currency?.toUpperCase()!==contract.currency||String(stripeToMinor(price.unit_amount,price.currency))!==String(contract.amount_minor)||price.recurring?.interval!==contract.billing_interval||price.recurring?.interval_count!==1)throw new Error('Subscription price or currency differs from the agreed contract.');
 return contract;
}
export function invoicePayment(invoice,subscription,contract,charge){
 const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id;
 if(!invoice?.id?.startsWith('in_')||invoice.subscription!==subscription.id||invoice.customer!==customer||invoice.currency?.toUpperCase()!==contract.currency)throw new Error('Invoice identity or currency mismatch.');
 const expected=minorToStripe(contract.amount_minor,contract.currency);
 const lines=invoice.lines?.data;
 if(invoice.lines?.has_more||lines?.length!==1||lines[0].price?.id!==contract.price_id||lines[0].quantity!==1||invoice.amount_due!==expected||invoice.total!==expected)throw new Error('Invoice amount or price mismatch.');
 const period=lines[0].period;
 if(!Number.isSafeInteger(period?.start)||!Number.isSafeInteger(period?.end)||period.end<=period.start)throw new Error('Invalid invoice period.');
 let status=invoice.status==='void'?'void':invoice.status==='uncollectible'?'uncollectible':invoice.attempted?'failed':'pending',refund='0';
 if(invoice.status==='paid'){
  if(invoice.amount_paid!==expected||invoice.paid_out_of_band||!charge||charge.customer!==customer||charge.invoice!==invoice.id||invoice.charge&&(typeof invoice.charge==='string'?invoice.charge:invoice.charge.id)!==charge.id||charge.currency?.toUpperCase()!==contract.currency||charge.amount!==expected||charge.paid!==true||charge.status!=='succeeded')throw new Error('Payment has not been verified.');
  refund=stripeToMinor(charge.amount_refunded||0,contract.currency);
  if(BigInt(refund)<0n||BigInt(refund)>BigInt(contract.amount_minor))throw new Error('Invalid refund amount.');
  status=charge.disputed?'disputed':BigInt(refund)===BigInt(contract.amount_minor)?'refunded':'paid';
 }
 return {reference:invoice.id,chargeReference:charge?.id||null,paymentIntent:typeof charge?.payment_intent==='string'?charge.payment_intent:charge?.payment_intent?.id||null,invoice:invoice.id,amount:String(contract.amount_minor),currency:contract.currency,status,refunded:refund,start:new Date(period.start*1000).toISOString(),end:new Date(period.end*1000).toISOString(),paidAt:invoice.status_transitions?.paid_at?new Date(invoice.status_transitions.paid_at*1000).toISOString():null,receipt:invoice.hosted_invoice_url||null};
}
export function entitled(subscription,now=Date.now()){return subscription?.plan_id==='plus'&&['active','past_due','canceled'].includes(subscription.status)&&Date.parse(subscription.paid_through)>now;}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planCountry,planCards,planRate,planCta} from '../src/plus-plans.js';

test('saved location detects NG/US before locale and ignores future destinations',()=>{
 assert.equal(planCountry({countryCode:'NG',nextCity:'New York'},['en-US']),'NG');
 assert.equal(planCountry({currentCity:'Lagos'},['en-US']),'NG');
 assert.equal(planCountry({country:'United States'},['en-NG']),'US');
 assert.equal(planCountry({currentCity:'New York'},['en-NG']),'US');
 assert.equal(planCountry({},['en-US']),'US');assert.equal(planCountry({},[]),'NG');
});
test('all three approved NG cards show exact weekly rates and actual CTA totals',()=>{
 const cards=planCards('NG');assert.deepEqual(cards.map(c=>c.interval),['week','month','year']);
 assert.deepEqual(cards.map(planRate),['₦1,200.00/wk','₦692.84/wk','₦384.62/wk']);
 assert.deepEqual(cards.map(planCta),['Enjoy 1 week for ₦1,200.00','Enjoy 1 month for ₦3,000.00','Enjoy 1 year for ₦20,000.00']);
 assert.deepEqual(cards.map(c=>c.header),['Standard rate','Popular','Save 68%']);
});
test('US cards show exact weekly rates and actual CTA totals without FX',()=>{
 const cards=planCards('US');assert.deepEqual(cards.map(planRate),['$1.99/wk','$1.15/wk','$0.67/wk']);
 assert.deepEqual(cards.map(planCta),['Enjoy 1 week for $1.99','Enjoy 1 month for $4.99','Enjoy 1 year for $34.99']);assert.equal(cards[2].header,'Save 66%');
 assert.deepEqual(planCards('FR'),[]);
});
test('old amounts cannot be attached to the new cards for checkout',()=>{
 const old={id:'old',amount:'150000',currency:'NGN',interval:'month',intervalCount:1,available:true};
 assert.equal(planCards('NG',[old])[1].available,false);
 const current={...old,id:'new',amount:'300000'};assert.equal(planCards('NG',[current])[1].available,true);assert.equal(planCards('NG',[current])[1].id,'new');
});
test('price version migration adds week intervals, preserves old contracts and contains all approved amounts',()=>{
 const sql=readFileSync('supabase/migrations/20261108030000_plus_weekly_prices.sql','utf8');
 for(const amount of [120000,300000,2000000,199,499,3499])assert.ok(sql.includes(','+amount+',true,true'));
 assert.ok(sql.includes("IN('week','month','year')"));assert.ok(!sql.includes('UPDATE public.subscriptions SET'));assert.ok(!/DELETE FROM/.test(sql));
});

test('other markets preserve explicitly configured server quotes without invented weekly prices',()=>{
 const quote={id:'fr-approved',currency:'EUR',interval:'month',intervalCount:1,amount:'499',available:true};
 const [card]=planCards('FR',[quote]);assert.equal(card.id,quote.id);assert.equal(card.amount,'499');assert.equal(card.available,true);assert.equal(card.weeklyAmount,null);assert.match(planRate(card),/month$/);
});

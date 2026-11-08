import {resolvePreferences} from './money.js';
export function readMoneyPreferences(userId,storage=globalThis.localStorage,languages){
 try{return resolvePreferences(JSON.parse(storage?.getItem('pacemate-money:'+userId)||'{}'),languages);}catch{return resolvePreferences({},languages);}
}
export function saveMoneyPreferences(userId,preferences,storage=globalThis.localStorage){const value=resolvePreferences(preferences,[]);try{storage?.setItem('pacemate-money:'+userId,JSON.stringify(value));}catch{}return value;}

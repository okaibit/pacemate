import test from 'node:test';
import assert from 'node:assert/strict';
import {requestLocation} from '../src/location.js';
test('location is requested explicitly, rounded for city lookup, and does not enable precise tracking',async()=>{
 let calls=0;const geolocation={getCurrentPosition(ok,error,options){calls++;assert.equal(options.enableHighAccuracy,false);assert.equal(options.timeout,10000);ok({coords:{latitude:6.5244123,longitude:3.3792123}});}};
 assert.equal(calls,0);assert.deepEqual(await requestLocation({geolocation,secureContext:true}),{latitude:6.52,longitude:3.38});assert.equal(calls,1);
});
test('permission denial, timeout and unavailable location retain a manual-city fallback',async()=>{
 for(const code of [1,2,3])await assert.rejects(requestLocation({secureContext:true,geolocation:{getCurrentPosition(ok,error){error({code});}}}),/city/);
 await assert.rejects(requestLocation({secureContext:true,geolocation:null}),/city/);
 let prompted=false;await assert.rejects(requestLocation({secureContext:false,geolocation:{getCurrentPosition(){prompted=true;}}}),/HTTPS/);assert.equal(prompted,false);
});

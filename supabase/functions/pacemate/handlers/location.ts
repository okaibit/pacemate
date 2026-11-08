import {handle,json,requireUser,body,HttpError} from '../server/http.ts';
import {rows,rateLimit} from '../server/feature-db.ts';

// Resolve a one-time position using existing city centres. No coordinate storage
// or external geocoding provider, and no requirement to finish onboarding first.
export default handle(async req=>{
 if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
 const user=await requireUser(req);
 const {latitude,longitude}=await body(req);
 if(typeof latitude!=='number'||!Number.isFinite(latitude)||latitude< -90||latitude>90||typeof longitude!=='number'||!Number.isFinite(longitude)||longitude< -180||longitude>180)throw new HttpError(422,'Invalid location. Enter your city instead.');
 await rateLimit(user.id,'location',10);
 const [city]=await rows(`SELECT display_name FROM (
 SELECT display_name,6371*2*asin(least(1,sqrt(power(sin(radians(latitude-$1::float8)/2),2)+cos(radians($1::float8))*cos(radians(latitude))*power(sin(radians(longitude-$2::float8)/2),2)))) AS distance
 FROM public.city_coordinates) nearby WHERE distance<=100 ORDER BY distance,display_name LIMIT 1`,[latitude,longitude]);
 return json({city:city?.display_name||null});
});

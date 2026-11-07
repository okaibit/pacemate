import {rows} from './feature-db.ts';
import {cityKey} from './validation.js';
import {HttpError} from './http.ts';
export async function cityCoordinates(city:string){
  const key=cityKey(city);
  const [cached]=await rows('SELECT latitude,longitude FROM public.city_coordinates WHERE city_key=$1',[key]);
  if(cached)return cached;
  const provider=Deno.env.get('PACEMATE_GEOCODING_URL');
  if(!provider)throw new HttpError(422,'Distance is unavailable for this city. Search by city instead.');
  // A configured Nominatim-compatible provider requires a global maximum of one request per second, caching,
  // attribution and an identifying User-Agent. Never call it on each keystroke.
  const lease=await rows(`INSERT INTO public.feature_limits(key,hits,updated_at) VALUES('provider:geocoding',1,now())
    ON CONFLICT(key) DO UPDATE SET updated_at=now() WHERE feature_limits.updated_at<now()-interval '1 second' RETURNING key`);
  if(!lease.length)throw new HttpError(429,'City lookup is busy. Try again in a moment.');
  const response=await fetch(provider+(provider.includes('?')?'&':'?')+'format=jsonv2&limit=1&city='+encodeURIComponent(city),{
    headers:{'User-Agent':'Pacemate/1.0 (trypacemate@gmail.com)'},signal:AbortSignal.timeout(6000),
  });
  if(!response.ok)throw new HttpError(503,'City lookup is unavailable. You can still search by city.');
  const [place]=await response.json();
  const latitude=Number(place?.lat),longitude=Number(place?.lon);
  if(!place||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw new HttpError(422,'Distance is unavailable for this city. Try a nearby city.');
  await rows('INSERT INTO public.city_coordinates(city_key,display_name,latitude,longitude) VALUES($1,$2,$3,$4) ON CONFLICT(city_key) DO NOTHING',[key,city,latitude,longitude]);
  return {latitude,longitude};
}

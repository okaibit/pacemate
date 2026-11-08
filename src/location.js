// No permission request until called from an explicit user action.
export function requestLocation({geolocation=globalThis.navigator?.geolocation,secureContext=globalThis.isSecureContext}={}) {
 if(!secureContext)return Promise.reject(new Error('Location needs HTTPS or localhost. Enter your city instead.'));
 if(!geolocation)return Promise.reject(new Error('Location is unavailable in this browser. Enter your city instead.'));
 return new Promise((resolve,reject)=>geolocation.getCurrentPosition(
  ({coords})=>resolve({latitude:Math.round(coords.latitude*100)/100,longitude:Math.round(coords.longitude*100)/100}),
  error=>reject(new Error(error.code===1?'Location permission was not granted. Enter your city instead.':error.code===3?'Location took too long. Try again or enter your city.':'Could not find your location. Enter your city instead.')),
  {enableHighAccuracy:false,timeout:10000,maximumAge:60000},
 ));
}

const temporaryCodes=new Set(['DATABASE_TIMEOUT','CONNECT_TIMEOUT','CONNECTION_CLOSED','CONNECTION_ENDED','CONNECTION_DESTROYED','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','08001','08003','08006','57P01','53300']);
export function requestFailure(error){
 const seen=new Set();let current=error,diagnostic='INTERNAL_ERROR';
 for(let depth=0;current&&depth<8&&!seen.has(current);depth++){
  seen.add(current);
  if(diagnostic==='INTERNAL_ERROR'&&typeof current.code==='string'&&/^[A-Z0-9_]{2,40}$/.test(current.code))diagnostic=current.code;
  if(typeof current.code==='string'&&temporaryCodes.has(current.code))return {status:503,code:current.code,error:'The service is temporarily unavailable. Please try again.'};
  current=current.cause;
 }
 return {status:500,code:diagnostic,error:'Something went wrong. Please try again.'};
}

// Raw Postgres queries can return text[] as a literal when type discovery is disabled.
export function stringList(value) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string' && item.length);
  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (text.startsWith('[')) {
    try { const parsed=JSON.parse(text); return Array.isArray(parsed)?stringList(parsed):[]; } catch { return []; }
  }
  if (!text.startsWith('{') || !text.endsWith('}')) return [];
  const result=[]; let item='', quoted=false, escaped=false, wasQuoted=false;
  const add=()=>{const clean=wasQuoted?item:item.trim();if(clean&&(wasQuoted||clean!=='NULL'))result.push(clean);item='';wasQuoted=false;};
  for(const character of text.slice(1,-1)) {
    if(escaped){item+=character;escaped=false;continue;}
    if(character==='\\'){escaped=true;continue;}
    if(character==='"'){quoted=!quoted;wasQuoted=true;continue;}
    if(character===','&&!quoted){add();continue;}
    if((character==='{'||character==='}')&&!quoted)return [];
    item+=character;
  }
  if(quoted||escaped)return [];
  add();return result;
}
export function normalizeProfile(profile) {
  if(!profile||typeof profile!=='object')return profile;
  return {...profile,sports:stringList(profile.sports),photos:stringList(profile.photos),...(profile.interestedIn!==undefined?{interestedIn:stringList(profile.interestedIn)}:{})};
}
export function normalizeProfileResponse(data) {
  if(!data||typeof data!=='object')return data;
  for(const key of ['profile','other'])if(data[key])data[key]=normalizeProfile(data[key]);
  if(Array.isArray(data.people))data.people=data.people.map(normalizeProfile);
  if(Array.isArray(data.matches))data.matches=data.matches.map(match=>({...match,other:normalizeProfile(match.other)}));
  return data;
}

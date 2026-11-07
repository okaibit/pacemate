export function createFoundationClient(api) {
 return {
  profile: async (target,expectedUserId) => (await api(target?`/api/foundation/members/${encodeURIComponent(target)}`:'/api/foundation',{expectedUserId})).profile,
  sports: async expectedUserId => (await api('/api/foundation/sports',{expectedUserId})).sports,
  save: async (body,expectedUserId) => (await api('/api/foundation',{method:'PUT',body,expectedUserId})).profile,
 };
}

// Keep inbox updates independent from other badges and discard stale account responses.
export function notificationPoll({request,currentUser,visible,onBadges,onInbox,onMessage,currentPath}) {
 let busy=false,stopped=false,owner=null,seen=new Set(),initialized=false;
 async function refresh(){
  if(stopped||!visible()||busy)return;
  const user=currentUser();if(!user)return;
  if(owner!==user){owner=user;seen=new Set();initialized=false;}
  busy=true;
  const valid=()=>!stopped&&currentUser()===user;
  try{await Promise.allSettled([
   request('/api/today/badges',{expectedUserId:user}).then(data=>{if(valid())onBadges(data);}),
   request('/api/notifications',{expectedUserId:user}).then(data=>{
    if(!valid())return;
    const items=data.items||[];
    const fresh=items.find(item=>!seen.has(item.id)&&!item.readAt&&item.kind==='message'&&item.href!==currentPath());
    for(const item of items)seen.add(item.id);
    // The initial inbox is history, not a newly arrived message.
    if(initialized&&fresh)onMessage(fresh);
    initialized=true;
    if(seen.size>500)seen=new Set(items.map(item=>item.id));
    onInbox(data);
   })
  ]);}finally{busy=false;}
 }
 return {refresh,stop(){stopped=true;seen.clear();}};
}

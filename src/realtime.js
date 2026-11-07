import {authClient,SUPABASE_URL,PUBLISHABLE_KEY} from './supabase.js';

// Private Broadcast channels carry change signals; all message contents and
// signed images are retrieved through the API's membership checks.
export function subscribe(topic,onChange,onState=()=>{},postgresChanges,presence) {
  let socket,timer,retry,joinTimer,stopped=false,attempt=0,ref=0,joined=false;
  const channel='realtime:'+topic;
  const send=(event,payload={},target=channel)=>{
    if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({topic:target,event,payload,ref:String(++ref),join_ref:target===channel?'1':undefined}));
  };
  const reconnect=()=>{
    if(stopped||retry)return;
    joined=false;onState(false);clearInterval(timer);clearTimeout(joinTimer);
    retry=setTimeout(()=>{retry=null;connect();},Math.min(30000,1000*2**Math.min(attempt++,5)));
  };
  async function connect(){
    if(stopped)return;
    try{
      const session=await authClient.getSession();if(!session||stopped)return;
      ref=0;
      socket=new WebSocket(SUPABASE_URL.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(PUBLISHABLE_KEY)+'&vsn=1.0.0');
      socket.onopen=()=>{
        send('phx_join',{config:{broadcast:{ack:false,self:false},presence:presence?{enabled:true,key:presence.key}:{enabled:false},private:true,...(postgresChanges?{postgres_changes:postgresChanges}:{})},access_token:session.access_token});
        joinTimer=setTimeout(()=>socket?.close(),10000);
        timer=setInterval(()=>send('heartbeat',{},'phoenix'),25000);
      };
      socket.onmessage=event=>{
        let message;try{message=JSON.parse(event.data);}catch{return;}
        if(message.topic!==channel)return;
        if(message.event==='phx_reply'&&message.ref==='1'){
          clearTimeout(joinTimer);
          if(message.payload.status==='ok'){joined=true;attempt=0;onState(true);onChange();if(presence)send('presence',{type:'presence',event:'track',payload:presence.state()});}else socket.close();
        }
        if(message.event==='broadcast'&&message.payload?.event==='changed')onChange();
        if(message.event==='postgres_changes')onChange(message.payload?.data);
        if(['phx_close','phx_error'].includes(message.event))socket.close();
      };
      socket.onclose=reconnect;
      socket.onerror=()=>socket.close();
    }catch{reconnect();}
  }
  const unsubscribeAuth=authClient.onChange(async(event,user)=>{
    if(!user){socket?.close();return;}
    if(event==='TOKEN_REFRESHED'&&joined){try{const session=await authClient.getSession();if(session)send('access_token',{access_token:session.access_token});}catch{socket?.close();}}
  });
  const visible=()=>{if(joined&&presence)send('presence',{type:'presence',event:'track',payload:presence.state()});if(document.visibilityState==='visible'){onChange();if(!socket||socket.readyState===WebSocket.CLOSED){clearTimeout(retry);retry=null;connect();}}};
  document.addEventListener('visibilitychange',visible);
  connect();
  return ()=>{stopped=true;clearInterval(timer);clearTimeout(retry);clearTimeout(joinTimer);unsubscribeAuth();document.removeEventListener('visibilitychange',visible);send('phx_leave');socket?.close();};
}

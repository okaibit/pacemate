export function createReplySwipe(onReply,onMove){
 let start=null,offset=0,vertical=false;
 return {
  start(x,y){start={x,y};offset=0;vertical=false;},
  move(x,y){if(!start)return false;const dx=x-start.x,dy=Math.abs(y-start.y);if(dy>12&&dy>Math.abs(dx))vertical=true;
   if(vertical)return false;offset=Math.max(0,Math.min(72,dx));onMove(offset);return dx>10&&dx>dy;
  },
  end(){const reply=!!start&&!vertical&&offset>=56;start=null;offset=0;onMove(0);if(reply)onReply();},
  cancel(){start=null;offset=0;onMove(0);}
 };
}

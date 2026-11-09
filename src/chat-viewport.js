// iOS changes the visual viewport when its keyboard opens, not CSS 100dvh.
// Keep the document still; only the message list should scroll inside the chat.
export function bindChatViewport(element,{win=window,doc=document}={}){
 const viewport=win.visualViewport,scrollX=win.scrollX||0,scrollY=win.scrollY||0;
 const saved=[];let frame=null,stopped=false;
 const save=(style,name,value)=>{saved.push([style,name,style.getPropertyValue(name),style.getPropertyPriority(name)]);style.setProperty(name,value);};
 for(const [name,value] of Object.entries({overflow:'hidden',position:'fixed',top:`-${scrollY}px`,left:'0',width:'100%'}))save(doc.body.style,name,value);
 save(doc.documentElement.style,'overflow','hidden');
 for(const name of ['--chat-height','--chat-top','--chat-bottom-safe-area'])saved.push([element.style,name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)]);
 let fullHeight=win.innerHeight;
 function update(){
  frame=null;if(stopped)return;
  // Preserve browser pinch zoom rather than fitting the app to a magnified viewport.
  if(viewport&&Math.abs(viewport.scale-1)>.05)return;
  const height=viewport?.height||win.innerHeight,top=Math.max(0,viewport?.offsetTop||0);
  const focused=element.contains(doc.activeElement)&&/^(INPUT|TEXTAREA)$/.test(doc.activeElement?.tagName);
  if(!focused)fullHeight=Math.max(fullHeight,win.innerHeight);
  element.style.setProperty('--chat-height',`${height}px`);
  element.style.setProperty('--chat-top',`${top}px`);
  element.style.setProperty('--chat-bottom-safe-area',focused&&fullHeight-height>120?'0px':'env(safe-area-inset-bottom,0px)');
 }
 function schedule(){if(frame===null&&!stopped)frame=win.requestAnimationFrame(update);}
 const listeners=[[win,'resize'],[win,'orientationchange'],[viewport,'resize'],[viewport,'scroll'],[element,'focusin'],[element,'focusout']];
 for(const [target,event] of listeners)target?.addEventListener(event,schedule);
 update();
 return ()=>{stopped=true;if(frame!==null)win.cancelAnimationFrame(frame);for(const [target,event] of listeners)target?.removeEventListener(event,schedule);
  for(const [style,name,value,priority] of saved){if(value)style.setProperty(name,value,priority);else style.removeProperty(name);}
  win.scrollTo(scrollX,scrollY);
 };
}

export function discoverHeight(top,viewportHeight,navTop){
 const bottom=Number.isFinite(navTop)?Math.min(viewportHeight,navTop):viewportHeight-20;
 return Math.max(0,Math.floor(bottom-top-8));
}
export function fitDiscoverViewport(page,{win=window,doc=document}={}){
 let frame=null,stopped=false,observer;
 function update(){frame=null;if(stopped)return;const nav=doc.querySelector('.shell > nav.tabs');
  const height=discoverHeight(page.getBoundingClientRect().top,win.visualViewport?.height||win.innerHeight,win.innerWidth<1050?nav?.getBoundingClientRect().top:undefined);
  const value=height+'px';if(page.style.getPropertyValue('--discover-height')!==value)page.style.setProperty('--discover-height',value);
 }
 function schedule(){if(!stopped&&frame===null)frame=win.requestAnimationFrame(update);}
 const viewport=win.visualViewport;
 win.addEventListener('resize',schedule);viewport?.addEventListener('resize',schedule);
 if(win.ResizeObserver){observer=new win.ResizeObserver(schedule);observer.observe(page);const header=doc.querySelector('.shell > header');if(header)observer.observe(header);const nav=doc.querySelector('.shell > nav.tabs');if(nav)observer.observe(nav);}
 update();return ()=>{stopped=true;if(frame!==null)win.cancelAnimationFrame(frame);observer?.disconnect();win.removeEventListener('resize',schedule);viewport?.removeEventListener('resize',schedule);page.style.removeProperty('--discover-height');};
}

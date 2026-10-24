// Pure geometry keeps directional navigation predictable across TV resolutions.
export function nextTarget(current, candidates, direction) {
  const center=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
  const from=center(current);let best=null,score=Infinity;
  for(const item of candidates){const to=center(item.rect);const dx=to.x-from.x,dy=to.y-from.y;
    const primary=direction==='right'?dx:direction==='left'?-dx:direction==='down'?dy:-dy;
    const secondary=direction==='right'||direction==='left'?Math.abs(dy):Math.abs(dx);
    if(primary<=1)continue;
    const value=primary+secondary*3;
    if(value<score){score=value;best=item.element;}
  }return best;
}
export function installNavigation({back,root=document}){
  const panel=root.getElementById('panel');
  const focusables=()=>[...(panel.open?panel:root).querySelectorAll('button,input,select,a[href]')].filter(el=>!el.disabled&&el.tabIndex!==-1&&el.getClientRects().length);
  function move(direction){const items=focusables(),active=root.activeElement;
    const target=!items.includes(active)?items[0]:nextTarget(active.getBoundingClientRect(),items.filter(el=>el!==active).map(element=>({element,rect:element.getBoundingClientRect()})),direction);
    if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  function command(key){if(key==='back'){back();return;}if(key==='select'){const active=root.activeElement;active?.click();if(['INPUT','SELECT'].includes(active?.tagName)&&window.chrome?.webview)window.chrome.webview.postMessage(JSON.stringify({type:'keyboard'}));return;}move(key);}
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'||event.key==='GoBack'||event.key==='BrowserBack'){event.preventDefault();back();return;}
    const direction={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[event.key];
    // Preserve text editing and native select/virtual-keyboard behavior.
    if(direction&&!['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)){event.preventDefault();move(direction);}
    if(event.key==='Tab'&&panel.open){const items=focusables(),i=items.indexOf(root.activeElement);if(event.shiftKey&&i===0){event.preventDefault();items.at(-1)?.focus();}else if(!event.shiftKey&&i===items.length-1){event.preventDefault();items[0]?.focus();}}
  });
  // The native shell forwards Xbox controller presses once. Browser previews use Gamepad API.
  window.streamUnifyCommand=command;
  if(!window.chrome?.webview){let previous=new Set(),lastDirection='',nextRepeat=0;
    function tick(now){const pad=[...(navigator.getGamepads?.()||[])].find(p=>p?.connected);const pressed=new Set();
      if(pad){pad.buttons.forEach((b,i)=>{if(b.pressed)pressed.add(i);});
        const direction=pressed.has(12)||pad.axes[1]<-.6?'up':pressed.has(13)||pad.axes[1]>.6?'down':pressed.has(14)||pad.axes[0]<-.6?'left':pressed.has(15)||pad.axes[0]>.6?'right':'';
        if(direction&&(direction!==lastDirection||now>=nextRepeat)){command(direction);nextRepeat=now+(direction===lastDirection?140:400);}lastDirection=direction;
        if(pressed.has(0)&&!previous.has(0))command('select');if(pressed.has(1)&&!previous.has(1))command('back');
      }else lastDirection='';previous=pressed;requestAnimationFrame(tick);
    }requestAnimationFrame(tick);
  }
  return {move};
}

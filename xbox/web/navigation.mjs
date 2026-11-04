// Pure geometry keeps directional navigation predictable across TV resolutions.
export function nextTarget(current,candidates,direction){
 const center=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
 const from=center(current);let best=null,score=Infinity;
 for(const item of candidates){const to=center(item.rect),dx=to.x-from.x,dy=to.y-from.y;
  const primary=direction==='right'?dx:direction==='left'?-dx:direction==='down'?dy:-dy;
  const secondary=direction==='right'||direction==='left'?Math.abs(dy):Math.abs(dx);
  if(primary<=1)continue;const value=primary+secondary*3;if(value<score){score=value;best=item.element;}
 }return best;
}
export function deepActive(root=document){let active=root.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;return active;}
export function visibleControls(root){
 const result=[];
 for(const el of root.querySelectorAll('*')){
  if(el.shadowRoot&&!el.hidden)result.push(...visibleControls(el.shadowRoot));
  if(!el.matches('button,input,select,textarea,a[href],summary')||el.disabled||el.tabIndex===-1||el.closest('[hidden],.hidden')||!el.getClientRects().length)continue;
  const style=getComputedStyle(el);if(style.visibility==='hidden'||style.display==='none')continue;
  result.push(el);
 }return result;
}
export function installNavigation({back,selectOptions,root=document}){
 const scope=()=>{
  const picker=root.getElementById('suWebTogether');
  const dialogs=[...root.querySelectorAll('dialog[open]'),...(picker?.shadowRoot?.querySelectorAll('dialog[open]')||[])];
  return dialogs.at(-1)||(!root.getElementById('modal')?.classList.contains('hidden')?root.getElementById('modal'):null)||root.querySelector('.su-drawer.open')||(picker&&!picker.hidden?picker.shadowRoot:root);
 };
 const focusables=()=>visibleControls(scope());
 let marked;root.addEventListener('focusin',()=>{marked?.removeAttribute('data-xbox-focus');marked=deepActive(root);marked?.setAttribute('data-xbox-focus','');});
 const focus=target=>{if(!target)return;target.focus({preventScroll:true});marked?.removeAttribute('data-xbox-focus');marked=target;target.setAttribute('data-xbox-focus','');target.scrollIntoView({block:'nearest',inline:'nearest'});};
 function move(direction){const items=focusables(),active=deepActive(root),within=scope().contains(active)&&active!==root.body&&active?.getClientRects().length;focus(within?nextTarget(active.getBoundingClientRect(),items.filter(el=>el!==active).map(element=>({element,rect:element.getBoundingClientRect()})),direction):items[0]);}
 function command(key){
  if(key==='back'){back();return;}
  if(key==='select'){const active=deepActive(root);if(active?.tagName==='SELECT'&&selectOptions){selectOptions(active);return;}active?.click();if(['INPUT','TEXTAREA'].includes(active?.tagName)&&!['checkbox','radio','range'].includes(active.type)&&window.chrome?.webview)window.chrome.webview.postMessage(JSON.stringify({type:'keyboard'}));return;}
  move(key);
 }
 root.addEventListener('keydown',event=>{
  if(['Escape','GoBack','BrowserBack'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();back();return;}
  const target=event.composedPath()[0],direction={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[event.key];
  if(direction&&!['INPUT','SELECT','TEXTAREA'].includes(target.tagName)){event.preventDefault();move(direction);}
  if(event.key==='Tab'&&scope()!==root){const items=focusables(),i=items.indexOf(deepActive(root));if(event.shiftKey&&i===0){event.preventDefault();focus(items.at(-1));}else if(!event.shiftKey&&i===items.length-1){event.preventDefault();focus(items[0]);}}
 },true);
 window.streamUnifyCommand=command;
 if(!window.chrome?.webview){let previous=new Set(),lastDirection='',nextRepeat=0;
  function tick(now){const pad=[...(navigator.getGamepads?.()||[])].find(p=>p?.connected),pressed=new Set();
   if(pad){pad.buttons.forEach((b,i)=>{if(b.pressed)pressed.add(i);});const direction=pressed.has(12)||pad.axes[1]<-.6?'up':pressed.has(13)||pad.axes[1]>.6?'down':pressed.has(14)||pad.axes[0]<-.6?'left':pressed.has(15)||pad.axes[0]>.6?'right':'';
    if(direction&&(direction!==lastDirection||now>=nextRepeat)){command(direction);nextRepeat=now+(direction===lastDirection?140:400);}lastDirection=direction;
    if(pressed.has(0)&&!previous.has(0))command('select');if(pressed.has(1)&&!previous.has(1))command('back');
   }else lastDirection='';previous=pressed;requestAnimationFrame(tick);
  }requestAnimationFrame(tick);
 }
 return {move,command};
}

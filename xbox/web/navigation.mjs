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
  if(!el.matches('button,input,select,textarea,a[href],summary')||el.disabled||el.tabIndex===-1||el.closest('[hidden],.hidden,[aria-hidden="true"],[inert]')||!el.getClientRects().length)continue;
  const closed=el.closest('details:not([open])');if(closed&&!closed.querySelector(':scope > summary')?.contains(el))continue;
  const style=getComputedStyle(el);if(style.visibility==='hidden'||style.display==='none')continue;
  result.push(el);
 }return result;
}
export function installNavigation({back,selectOptions,editText,root=document}){
 const scope=()=>{
  const picker=root.getElementById('suWebTogether');
  const dialogs=[...root.querySelectorAll('dialog[open]'),...(picker?.shadowRoot?.querySelectorAll('dialog[open]')||[])];
  return root.querySelector('dialog[data-xbox-overlay][open]')||dialogs.at(-1)||(!root.getElementById('modal')?.classList.contains('hidden')?root.getElementById('modal'):null)||root.querySelector('.su-drawer.open')||(picker&&!picker.hidden?picker.shadowRoot:root);
 };
 const focusables=()=>visibleControls(scope());
 let pendingText=null;
 window.streamUnifyTextResult=result=>{const target=pendingText;pendingText=null;if(!target?.isConnected)return;if(result.accepted){target.value=result.text;target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));}focus(target);};
 let marked;root.addEventListener('focusin',()=>{marked?.removeAttribute('data-xbox-focus');marked=deepActive(root);marked?.setAttribute('data-xbox-focus','');});
 const focus=target=>{if(!target)return false;target.focus({preventScroll:true});if(deepActive(root)!==target)return false;marked?.removeAttribute('data-xbox-focus');marked=target;target.setAttribute('data-xbox-focus','');target.scrollIntoView({block:'nearest',inline:'nearest'});return true;};
 // Shared catalog and service controls are rebuilt after selection. Keep focus
 // on the equivalent replacement instead of jumping back to the header.
 let recoveryQueued=false;
 const recover=()=>{
  recoveryQueued=false;const active=deepActive(root);
  if(!marked||marked.isConnected||(active&&active!==root.body&&active.isConnected))return;
  const controls=focusables();
  const keys=['id','data-service','data-details','data-watch','data-order','data-save','data-notify','data-person','data-genre','data-mood','data-mode','data-alert-read','data-alert-remove','href'];
  const identity=keys.filter(key=>marked.hasAttribute(key));
  const target=identity.length?controls.find(el=>el.tagName===marked.tagName&&identity.every(key=>el.getAttribute(key)===marked.getAttribute(key))):controls.find(el=>el.tagName===marked.tagName&&el.textContent===marked.textContent&&el.className===marked.className);
  if(target)focus(target);
 };
 const watch=()=>{if(!recoveryQueued){recoveryQueued=true;queueMicrotask(recover);}};
 new MutationObserver(watch).observe(root.body,{childList:true,subtree:true});
 const picker=root.getElementById('suWebTogether');
 if(picker)customElements.whenDefined('su-web-pick-together').then(()=>{if(picker.shadowRoot)new MutationObserver(watch).observe(picker.shadowRoot,{childList:true,subtree:true});});
 function move(direction){const items=focusables(),active=deepActive(root),within=scope().contains(active)&&active!==root.body&&active?.getClientRects().length;const target=within?nextTarget(active.getBoundingClientRect(),items.filter(el=>el!==active).map(element=>({element,rect:element.getBoundingClientRect()})),direction):items[0];if(target)focus(target);else if(direction==='up'||direction==='down')scroll(direction);}
 // Scroll the nearest scrollable panel, or the page. This also handles long
 // descriptions that have no focusable control below the current selection.
 function scroll(direction){
  const sign=direction==='up'?-1:1,active=deepActive(root),boundary=scope();
  let node=active?.parentElement;
  while(node&&node!==root.body){
   const style=getComputedStyle(node);
   if(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1){
    const before=node.scrollTop;node.scrollBy({top:sign*Math.max(120,node.clientHeight*.45),behavior:'instant'});
    if(node.scrollTop!==before||boundary!==root)return;
   }
   node=node.parentElement||node.getRootNode()?.host;
  }
  if(boundary===root)window.scrollBy({top:sign*innerHeight*.45,behavior:'instant'});
 }
 function command(key){
  if(key==='scrollup'||key==='scrolldown'){scroll(key==='scrollup'?'up':'down');return;}

  if(key==='back'){back();return;}
  if(key==='select'){const active=deepActive(root);if(editText?.(active))return;if(active?.tagName==='SELECT'&&selectOptions){selectOptions(active);return;}if(['INPUT','TEXTAREA'].includes(active?.tagName)&&!['checkbox','radio','range','button','submit'].includes(active.type)&&window.chrome?.webview){pendingText=active;window.chrome.webview.postMessage(JSON.stringify({type:'keyboard',value:active.value,inputType:active.type||'text',label:active.labels?.[0]?.textContent||active.getAttribute('aria-label')||active.placeholder||'Enter text',maxLength:active.maxLength>0?Math.min(active.maxLength,4096):4096}));return;}active?.click();return;}
  move(key);
 }
 root.addEventListener('keydown',event=>{
  if(['Escape','GoBack','BrowserBack'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();back();return;}
  const target=event.composedPath()[0],direction={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[event.key];
  if(direction&&!['INPUT','SELECT','TEXTAREA'].includes(target.tagName)){event.preventDefault();move(direction);}
  if(event.key==='Tab'&&scope()!==root){const items=focusables(),i=items.indexOf(deepActive(root));if(event.shiftKey&&i===0){event.preventDefault();focus(items.at(-1));}else if(!event.shiftKey&&i===items.length-1){event.preventDefault();focus(items[0]);}}
 },true);
 window.streamUnifyCommand=command;
 if(!window.chrome?.webview){let previous=new Set(),lastDirection='',nextRepeat=0,nextScroll=0;
  function tick(now){const pad=[...(navigator.getGamepads?.()||[])].find(p=>p?.connected),pressed=new Set();
   if(pad){pad.buttons.forEach((b,i)=>{if(b.pressed)pressed.add(i);});const direction=pressed.has(12)||pad.axes[1]<-.6?'up':pressed.has(13)||pad.axes[1]>.6?'down':pressed.has(14)||pad.axes[0]<-.6?'left':pressed.has(15)||pad.axes[0]>.6?'right':'';
    if(direction&&(direction!==lastDirection||now>=nextRepeat)){command(direction);nextRepeat=now+(direction===lastDirection?140:400);}lastDirection=direction;
    if(Math.abs(pad.axes[3]||0)>.55&&now>=nextScroll){command(pad.axes[3]<0?'scrollup':'scrolldown');nextScroll=now+160;}
    if(pressed.has(0)&&!previous.has(0))command('select');if(pressed.has(1)&&!previous.has(1))command('back');
   }else lastDirection='';previous=pressed;requestAnimationFrame(tick);
  }requestAnimationFrame(tick);
 }
 return {move,command};
}

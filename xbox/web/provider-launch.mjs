import {providerForUrl} from './provider-policy.mjs';

export function installProviderLaunch({notice,timeoutMs=12000}){
 let pending=null,sequence=0;
 const post=message=>window.chrome?.webview?.postMessage(JSON.stringify(message));
 const cancel=dialog=>{if(pending?.dialog===dialog){clearTimeout(pending.timer);post({type:'providerCancel',requestId:pending.id});pending=null;}};
 window.streamUnifyProviderResult=result=>{
  if(!pending||result?.requestId!==pending.id)return;
  const current=pending;clearTimeout(current.timer);pending=null;
  if(result.status==='launched'){current.dialog.close();notice('Opening '+current.provider.name+'…');return;}
  current.heading.textContent='Open '+current.provider.name;
  current.status.textContent=result.status==='unavailable'||result.status==='ambiguous'
   ?'No single compatible app is available for this link. Open '+current.provider.name+' from Xbox Home'+(current.title?' and search for “'+current.title+'”.':'.')
   :'The app could not be opened. Try again, or open '+current.provider.name+' from Xbox Home'+(current.title?' and search for “'+current.title+'”.':'.');
  current.button.textContent='Back';current.button.focus();
 };
 return (link)=>{
  const provider=providerForUrl(link.href);if(!provider)return false;
  if(document.querySelector('dialog[data-xbox-provider][open]'))return true;
  const titleNode=(link.closest('#modal')?document.getElementById('modalTitle'):link.closest('dialog')?.querySelector('#choiceTitle'))?.cloneNode(true);
  titleNode?.querySelectorAll('[aria-hidden="true"]').forEach(el=>el.remove());
  const title=titleNode?.textContent.trim()||'';
  const dialog=document.createElement('dialog');dialog.className='xbox-select';dialog.dataset.xboxOverlay='true';dialog.dataset.xboxProvider='true';dialog.setAttribute('aria-label','Open streaming app');
  const heading=document.createElement('h2');heading.textContent='Opening '+provider.name+'…';
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Checking for an installed app that supports this link…';
  const detail=document.createElement('p');detail.className='xbox-provider-note';detail.textContent='Xbox Developer Mode cannot run retail provider apps. The provider controls sign-in and whether this link opens the exact title.';
  const button=document.createElement('button');button.type='button';button.textContent='Cancel';button.onclick=()=>dialog.close();
  dialog.append(heading,status,detail,button);
  dialog.addEventListener('close',()=>{cancel(dialog);dialog.remove();if(link.isConnected&&!document.querySelector('dialog[data-xbox-provider][open]'))link.focus({preventScroll:true});});
  dialog.addEventListener('cancel',()=>cancel(dialog));
  document.body.append(dialog);dialog.showModal();button.focus();
  const id=String(++sequence);pending={id,dialog,heading,status,button,provider,title};
  pending.timer=setTimeout(()=>{post({type:'providerCancel',requestId:id});window.streamUnifyProviderResult({requestId:id,status:'failed'});},timeoutMs);
  try{if(!window.chrome?.webview)throw Error('Native host unavailable');post({type:'providerLaunch',requestId:id,url:provider.url});}
  catch{window.streamUnifyProviderResult({requestId:id,status:'failed'});}
  return true;
 };
}

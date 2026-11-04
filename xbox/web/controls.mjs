import {installNavigation} from './navigation.mjs';
const $=id=>document.getElementById(id);
let toastTimer;
function notice(text){let toast=$('xboxNotice');if(!toast){toast=document.createElement('div');toast.id='xboxNotice';toast.className='xbox-status';toast.setAttribute('role','status');document.body.append(toast);}toast.hidden=false;toast.textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,6500);}
function back(){
 const picker=$('suWebTogether'),shadow=picker?.shadowRoot;
 const dialogs=[...document.querySelectorAll('dialog[open]'),...(shadow?.querySelectorAll('dialog[open]')||[])];
 const dialog=dialogs.at(-1);
 if(dialog){if(shadow?.contains(dialog)){picker.dismiss();}else{dialog.dispatchEvent(new Event('cancel',{cancelable:true}));if(dialog.open)dialog.close();}return;}
 if(!$('modal').classList.contains('hidden')){$('close').click();return;}
 if($('suDrawer')?.classList.contains('open')){document.querySelector('#suDrawer .su-close')?.click();return;}
 if(picker&&!picker.hidden){shadow.getElementById('home').click();return;}
 const expanded=[...document.querySelectorAll('details[open]')].find(el=>el.contains(document.activeElement));
 if(expanded){expanded.open=false;expanded.querySelector('summary')?.focus();return;}
 $('search').focus();$('search').scrollIntoView({block:'center'});
}
function selectOptions(select){
 const dialog=document.createElement('dialog');dialog.className='xbox-select';dialog.setAttribute('aria-label',select.labels?.[0]?.textContent||'Choose an option');
 const heading=document.createElement('h2');heading.textContent=select.labels?.[0]?.textContent||'Choose an option';dialog.append(heading);
 const cancel=document.createElement('button');cancel.textContent='Back';cancel.onclick=()=>dialog.close();dialog.append(cancel);
 for(const option of select.options){if(option.disabled)continue;const b=document.createElement('button');b.textContent=option.text;b.setAttribute('aria-pressed',String(option.selected));b.onclick=()=>{select.value=option.value;dialog.close();select.dispatchEvent(new Event('change',{bubbles:true}));};dialog.append(b);}
 dialog.addEventListener('close',()=>{dialog.remove();select.focus();});document.body.append(dialog);dialog.showModal();dialog.querySelector('[aria-pressed="true"]')?.focus();
}
window.streamUnifyConfirm=text=>new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='xbox-select';dialog.setAttribute('aria-label','Confirm account deletion');
 const message=document.createElement('p');message.textContent=text;dialog.append(message);
 let accepted=false;
 for(const [label,value] of [['Cancel',false],['Delete account',true]]){const button=document.createElement('button');button.textContent=label;button.type='button';button.onclick=()=>{accepted=value;dialog.close();};dialog.append(button);}
 dialog.addEventListener('close',()=>{dialog.remove();resolve(accepted);});document.body.append(dialog);dialog.showModal();dialog.querySelector('button').focus();
});
installNavigation({back,selectOptions});
// Keep all provider information, but do not claim unsupported provider app launches.
// Legal documents use the shell's two explicitly allowed destinations.
document.addEventListener('click',event=>{
 const link=event.composedPath().find(el=>el?.tagName==='A'&&el.getAttribute('href'));
 if(!link)return;
 const url=new URL(link.getAttribute('href'),location.href);
 if(url.origin===location.origin){if(url.pathname===location.pathname||url.pathname==='/')return;event.preventDefault();event.stopImmediatePropagation();notice('Open this information on streamunify.com. For help: support@streamunify.com.');return;}
 event.preventDefault();event.stopImmediatePropagation();
 if(['https://www.streamunify.com/privacy','https://www.streamunify.com/terms'].includes(url.href)&&window.chrome?.webview){window.chrome.webview.postMessage(JSON.stringify({type:'legal',url:url.href}));return;}
 notice('Open the provider’s Xbox app and search for this title. Direct provider launching is not available in this preview.');
},true);
window.streamUnifyResume=()=>window.dispatchEvent(new Event('membershipchange'));
// Shadow DOM has its own stylesheet, so TV focus and sizing must be applied there.
const picker=$('suWebTogether');
if(picker){const style=document.createElement('style');style.textContent=':host{font-size:22px}button,input{font-size:21px!important;min-height:54px}button:focus-visible,input:focus-visible,a:focus-visible,[data-xbox-focus]{outline:4px solid #9edcff!important;outline-offset:5px!important}button,input,a[href]{scroll-margin-block:85px}.wrap{max-width:1450px!important;padding:35px!important}.muted,.unknown,.cost,small{font-size:18px!important}.dialog{max-width:900px!important;width:80vw!important}';const attach=()=>{if(picker.shadowRoot&&!picker.shadowRoot.querySelector('[data-xbox-tv]')){const copy=style.cloneNode(true);copy.dataset.xboxTv='true';picker.shadowRoot.append(copy);}};customElements.whenDefined('su-web-pick-together').then(()=>{attach();new MutationObserver(attach).observe(picker.shadowRoot,{childList:true});});}
$('search')?.focus({preventScroll:true});

const version=document.createElement('span');version.textContent='Xbox preview '+(window.STREAMUNIFY_XBOX_BUILD?.version||'0.2.1.0');version.style.cssText='font-size:16px;color:#adbbd5';document.querySelector('.su-header').append(version);

const hints=document.createElement('div');hints.className='xbox-controller-hints';hints.textContent='D-pad / left stick: Move   •   Right stick: Scroll   •   A: Select / Type   •   B: Back';document.body.append(hints);

const providerCaption=document.querySelector('.su-provider-strip + .su-provider-caption');if(providerCaption)providerCaption.textContent='Streaming provider apps open separately on Xbox.';

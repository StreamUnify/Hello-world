import {createClient} from '@supabase/supabase-js';
import {installNavigation} from './navigation.mjs';
const $=id=>document.getElementById(id),panel=$('panel'),body=$('panelBody');
const base=window.STREAMUNIFY_XBOX_API_BASE;
let client,config,user,status,titles=[],saved=[],view='discover',filter='all',serial=0,searchBusy=false,returnFocus;
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const selected=new Set(read('su_xbox_services',['Netflix','Hulu','Tubi']));
const coreServices=['Netflix','Disney+','Hulu','Peacock','Sling','Max','Discovery+','Paramount+','Cuebroadcast','Tubi'];
const aliases={netflix:'Netflix',disneyplus:'Disney+',hulu:'Hulu',peacock:'Peacock',peacockpremium:'Peacock',peacockpremiumplus:'Peacock',sling:'Sling',slingtv:'Sling',slingorange:'Sling',slingblue:'Sling',max:'Max',hbomax:'Max',hbomaxamazonchannel:'Max',discoveryplus:'Discovery+',discoveryplusamazonchannel:'Discovery+',paramountplus:'Paramount+',paramountpluswithshowtime:'Paramount+',cuebroadcast:'Cuebroadcast',tubi:'Tubi',tubitv:'Tubi'};
const providerName=name=>aliases[String(name).toLowerCase().replace(/[^a-z0-9]/g,'')]||name;
const premium=()=>status?.plan==='premium';
const isFree=p=>['free','free with ads','ad-supported'].includes(String(p.type).toLowerCase());
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
function notice(text){$('status').textContent=text;}
function error(text){$('panelStatus').textContent=text;}
function show(title){returnFocus=document.activeElement;body.replaceChildren();$('panelTitle').textContent=title;error('');panel.showModal();$('closePanel').focus();}
function close(){panel.close();if(returnFocus?.isConnected)returnFocus.focus();else $('home').focus();}
function back(){if(panel.open)close();else if(view!=='discover'||filter!=='all'){view='discover';filter='all';render();$('home').focus();}else $('query').focus();}
$('closePanel').onclick=close;panel.addEventListener('cancel',e=>{e.preventDefault();close();});installNavigation({back});
async function api(path,options={}){
  const session=client?(await client.auth.getSession()).data.session:null;
  const response=await fetch(base+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers,...(session?{Authorization:'Bearer '+session.access_token}:{})},signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok){if(data.membership)status=data.membership;if(response.status===401){user=null;status=null;saved=[];drawAccount();}throw Error(data.error||'StreamUnify is temporarily unavailable.');}return data;
}
function drawAccount(){
  $('account').textContent=user?'My account':'Sign in';$('membership').textContent=!config?.enabled?'Accounts unavailable':!user?'Sign in to search':premium()?'Premium active':`${status?.remaining??10} searches remaining`;
  $('country').disabled=!premium();if(!premium()){$('country').value='US';$('country').textContent='Country: United States';}
}
async function refresh(){
  const session=client?(await client.auth.getSession()).data.session:null;user=session?.user;status=null;saved=[];
  if(user){try{status=await api('/api/account');if(premium())saved=(await api('/api/watchlist')).items.map(row=>row.snapshot);}catch(e){drawAccount();throw e;}}
  drawAccount();render();
}
async function load(search=false){
  if(searchBusy)return;
  const query=search?$('query').value.trim():'';
  if(query&&(!config?.enabled||!client)){notice('Search requires the account service. Try again shortly.');return;}
  if(query&&!user){account();error('Sign in to use your monthly searches.');return;}
  const request=++serial;searchBusy=true;$('searchForm').querySelector('button').disabled=true;$('retry').hidden=true;notice('Loading titles…');
  try{const country=premium()?$('country').value:'US';const data=await api(query?'/api/search?q='+encodeURIComponent(query)+'&country='+country:'/api/trending?country='+country,{headers:query?{'X-Search-Id':crypto.randomUUID()}: {}});
    if(request!==serial)return;titles=data.results||[];if(data.membership)status=data.membership;
    view='discover';drawAccount();render();const available=Object.values(data.sources||{}).includes('ok');
    notice(available?`${titles.length} titles · Availability can change.`:'Catalog sources are unavailable. Please try again.');$('retry').hidden=!(!available);
  }catch(e){if(request!==serial)return;titles=[];render();notice(e.message);$('retry').hidden=false;}
  finally{searchBusy=false;$('searchForm').querySelector('button').disabled=false;}
}
function render(){
  $('heading').textContent=view==='watchlist'?'My watchlist':({all:'Discover',movie:'Movies',series:'TV shows',free:'Free options',mine:'On my services'})[filter];
  document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter&&view==='discover')));
  const pool=view==='watchlist'?saved:titles;
  const list=pool.filter(t=>view==='watchlist'||filter==='all'||filter===t.type||filter==='free'&&(t.providers||[]).some(isFree)||filter==='mine'&&(t.providers||[]).some(p=>selected.has(providerName(p.name))));
  const results=$('results');results.replaceChildren();
  if(!list.length){const empty=node('p',view==='watchlist'?'Your watchlist is empty. Save a title from Discover.':'No matching titles. Try another search or filter.');empty.className='empty';results.append(empty);return;}
  for(const title of list){const card=node('button');card.className='title-card';card.type='button';
    let poster;try{const url=new URL(title.poster);if(url.protocol==='https:'&&!url.username&&!url.password){poster=node('img');poster.src=url.href;poster.alt='';poster.loading='lazy';poster.onerror=()=>{poster.removeAttribute('src');poster.className='poster-empty';};}}catch{}
    if(!poster){poster=node('div','StreamUnify');poster.className='poster-empty';}
    card.append(poster,node('strong',title.name),node('small',`${title.year||''} · ${title.type==='series'?'TV show':title.type||'Title'}`));card.onclick=()=>details(title);results.append(card);
  }
}
function details(title){
  show(title.name);body.append(node('p',title.desc||'No synopsis available.'));
  if(view==='watchlist')body.append(node('p','Saved title. Search for this title to refresh its streaming availability.'));
  const providers=node('ul');providers.className='provider-list';
  for(const p of title.providers||[])providers.append(node('li',`${p.name} · ${p.type||'Check provider'}`));
  body.append(providers,node('p',(title.providers||[]).length?'Availability is for the selected country. Open the provider’s Xbox app and search for this title.':'No current streaming options are available for this title in the selected country.'));
  if(premium()){const button=node('button',saved.some(t=>String(t.id)===String(title.id))?'Remove from watchlist':'Save to watchlist');body.append(button);button.onclick=async()=>{button.disabled=true;try{const exists=saved.some(t=>String(t.id)===String(title.id));await api('/api/watchlist'+(exists?'?id='+encodeURIComponent(title.id):''),{method:exists?'DELETE':'POST',...(exists?{}:{body:JSON.stringify(title)})});await refresh();button.textContent=exists?'Save to watchlist':'Remove from watchlist';error(exists?'Removed from your watchlist.':'Saved to your account.');}catch(e){error(e.message);}finally{button.disabled=false;}};}
  else body.append(node('p','Watchlists are available to members with an active Premium subscription.'));
}
function account(){
  show('Your StreamUnify account');
  if(!client){body.append(node('p','Account service is unavailable. Close this panel and try again shortly.'));return;}
  if(user){body.append(node('p',user.email),node('p',premium()?'Premium is active. Your watchlist syncs with your StreamUnify account.':`${status?.remaining??10} searches remaining. Free accounts can search our 10 selected US providers. Watchlists require Premium.`));
    body.append(node('p','Existing memberships are recognized after sign-in. Purchases and subscription management are not available in this version.'));
    const logout=node('button','Sign out of this Xbox');logout.onclick=async()=>{logout.disabled=true;try{const {error:failure}=await client.auth.signOut({scope:'local'});if(failure)throw failure;++serial;user=null;status=null;saved=[];titles=[];view='discover';drawAccount();render();close();notice('Signed out.');}catch(e){error(e.message);logout.disabled=false;}};body.append(logout);return;
  }
  body.append(node('p','Sign in to search and access your existing membership. Free accounts include 10 searches per monthly period across our 10 selected US providers.'));
  const form=node('form'),email=node('input'),password=node('input');email.type='email';email.required=true;email.autocomplete='email';email.maxLength=254;password.type='password';password.required=true;password.autocomplete='current-password';password.maxLength=128;
  for(const [text,input] of [['Email',email],['Password',password]]){const label=node('label',text);label.append(input);form.append(label);}
  const submit=node('button','Sign in');submit.type='submit';form.append(submit);body.append(form);
  form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;error('Signing in…');try{const {error:failure}=await client.auth.signInWithPassword({email:email.value.trim(),password:password.value});password.value='';if(failure)throw failure;await refresh();close();await load();}catch(e){error(e.message);}finally{password.value='';submit.disabled=false;}};
  const signup=node('button','Create a free account');signup.type='button';form.append(signup);signup.onclick=async()=>{if(!email.reportValidity()||!password.reportValidity())return;if(password.value.length<12){error('Use at least 12 characters for a new account password.');return;}signup.disabled=true;try{const {error:failure}=await client.auth.signUp({email:email.value.trim(),password:password.value,options:{emailRedirectTo:'https://www.streamunify.com/'}});password.value='';if(failure)throw failure;error('Check your email to verify your account, then sign in here.');}catch(e){error(e.message);}finally{password.value='';signup.disabled=false;}};
}
$('account').onclick=account;
$('home').onclick=()=>{view='discover';filter='all';$('query').value='';load();};
$('watchlist').onclick=async()=>{if(!user){account();return;}if(!premium()){show('My watchlist');body.append(node('p','Watchlists require an active StreamUnify Premium membership.'));return;}try{await refresh();view='watchlist';render();notice('Saved titles from your StreamUnify account.');$('results').querySelector('button')?.focus();}catch(e){notice(e.message);}};
$('services').onclick=()=>{show('My streaming services');body.append(node('p','Selections filter the current results. They do not connect or sign in to provider accounts.'));const list=node('div');list.className='service-list';body.append(list);
  const names=[...new Set([...coreServices,...(premium()?titles.flatMap(t=>(t.providers||[]).map(p=>providerName(p.name))):[])])].sort();
  for(const name of names){const button=node('button',name);button.setAttribute('aria-pressed',String(selected.has(name)));button.onclick=()=>{selected.has(name)?selected.delete(name):selected.add(name);try{localStorage.setItem('su_xbox_services',JSON.stringify([...selected]));}catch{}button.setAttribute('aria-pressed',String(selected.has(name)));render();};list.append(button);}
};
$('help').onclick=()=>{show('Help & contact');body.append(node('p','Contact support@streamunify.com for help. Please do not send passwords or payment details.'),node('p','StreamUnify is a discovery tool. Streaming subscriptions are separate. Provider app launching is not enabled in this preview.'));
  for(const [label,url] of [['Privacy policy','https://www.streamunify.com/privacy'],['Terms of service','https://www.streamunify.com/terms']]){const button=node('button',label);button.onclick=()=>{if(window.chrome?.webview)window.chrome.webview.postMessage(JSON.stringify({type:'legal',url}));else window.open(url,'_blank','noopener,noreferrer');};body.append(button);}
};
$('searchForm').onsubmit=e=>{e.preventDefault();load(true);};$('country').onclick=()=>{if(!premium())return;show('Select country');for(const [code,name] of Object.entries({US:'United States',CA:'Canada',GB:'United Kingdom',AU:'Australia',NZ:'New Zealand',IN:'India',FR:'France',DE:'Germany',ES:'Spain',IT:'Italy',BR:'Brazil',MX:'Mexico',JP:'Japan'})){const button=node('button',name);button.onclick=()=>{$('country').value=code;$('country').textContent='Country: '+name;close();load();};body.append(button);}};$('retry').onclick=()=>initialize();
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;view='discover';render();});
window.streamUnifyResume=()=>refresh().then(()=>load()).catch(e=>notice(e.message));
async function initialize(){try{
  const origin=new URL(base);if(origin.protocol!=='https:'||origin.origin!==base)throw Error('Invalid Xbox service configuration.');
  config=await api('/api/account/config');if(config.enabled){client??=createClient(config.supabaseUrl,config.publishableKey,{auth:{storageKey:'streamunify-xbox-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});await refresh();}else drawAccount();
  await load();
}catch(e){notice(e.message);$('retry').hidden=false;}}
initialize();$('home').focus();

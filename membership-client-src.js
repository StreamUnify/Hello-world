import {createClient} from '@supabase/supabase-js';
import {isNative,nativePlatform,nativeRedirect,createNativeSessionStorage,prepareNativeStorage,configureNativeAuth,nativeProducts,buyNative,restoreNative,listenNativePurchases,manageNative} from './native-client.mjs';
const apiBase=(window.STREAMUNIFY_API_BASE||'').replace(/\/$/,'');
let client,config,status,user,busy=false;
const native=isNative;
const button=document.createElement('button');button.type='button';button.className='su-action';button.textContent='Account';button.hidden=true;
document.querySelector('.su-discover')?.append(button);
const dialog=document.createElement('dialog');dialog.className='membership-dialog';
dialog.innerHTML=`<form id="accountForm"><button type="button" id="accountClose" class="close" aria-label="Close account">×</button><h2>StreamUnify membership</h2><p id="accountStatus" role="status" aria-live="polite"></p><div id="accountFields"><section aria-label="Membership options"><h3>New to StreamUnify?</h3><p>Free membership: 10 searches per month across our 10 selected US providers.</p><p id="signupPricing"><strong>Premium: $2.99/month or $30/year</strong><br>Save $5.88 with annual billing. Unlimited searches, all supported providers, and your synced watchlist.</p><p>Create and verify your account, then choose a plan. Paid plans renew until canceled; provider subscriptions are separate.</p></section><label>Email<input id="accountEmail" type="email" autocomplete="email" required maxlength="254"></label><label>Password<input id="accountPassword" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></label><button type="submit" class="primary">Sign in</button><button type="button" id="accountSignup">Sign up</button><button type="button" id="accountReset">Forgot password?</button></div><div id="accountPlans"><p>Free: 10 searches per month across the 10 selected US providers. Premium: unlimited searches, all supported providers, and your synced watchlist.</p><p id="membershipPriceNote"><strong>$2.99/month or $30/year</strong> — save $5.88 annually. Subscriptions renew until cancelled. Streaming service subscriptions are separate.</p><button type="button" data-plan="monthly">Choose monthly</button><button type="button" data-plan="annual">Choose annual</button><button type="button" id="accountPortal">Manage subscription</button><button type="button" id="accountImport">Import this device’s saved titles</button><button type="button" id="accountLogout">Sign out</button></div><p><a href="https://www.streamunify.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a> · <a href="https://www.streamunify.com/terms" target="_blank" rel="noopener noreferrer">Membership terms</a></p><p id="accountMessage" role="status" aria-live="polite"></p></form>`;
document.body.append(dialog);
const restoreButton=document.createElement('button');restoreButton.type='button';restoreButton.textContent='Restore purchases';restoreButton.id='accountRestore';document.getElementById('accountPlans').append(restoreButton);
const deleteButton=document.createElement('button');deleteButton.type='button';deleteButton.textContent='Delete account';deleteButton.id='accountDelete';document.getElementById('accountPlans').append(deleteButton);
let storePrices={};
const $=id=>document.getElementById(id);
const message=text=>{$('accountMessage').textContent=text;};
const show=()=>{if(!dialog.open)dialog.showModal();};
button.onclick=show;$('accountClose').onclick=()=>dialog.close();
function draw(){
  button.textContent=user?(status?.plan==='premium'?'Premium':'My account'):'Sign in';
  $('accountFields').hidden=!!user;$('accountPlans').hidden=!user;
  $('accountStatus').textContent=!user?'Sign in or create a free account.':status?.plan==='premium'?'Premium is active.':`${status?.remaining??10} of 10 searches remaining.${status?.reset_at?' Resets '+new Date(status.reset_at).toLocaleString()+'.':''}`;
  const store=nativePlatform()==='ios'?'apple':'google';
  dialog.querySelectorAll('[data-plan]').forEach(b=>{b.hidden=status?.plan==='premium'||(native()?!config.stores?.[store]||!storePrices[b.dataset.plan]:!config.billingEnabled);b.textContent=native()?`${storePrices[b.dataset.plan]?.priceString||''} / ${b.dataset.plan==='monthly'?'month':'year'}`:`Choose ${b.dataset.plan}`;});
  $('accountPortal').hidden=native()?!config.stores?.[store]:!config.billingEnabled;
  restoreButton.hidden=!native()||!config.stores?.[store];
  $('accountImport').hidden=status?.plan!=='premium';
}
async function api(path,options={}){
  const {data:{session}}=await client.auth.getSession();
  const response=await fetch(apiBase+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers,...(session?{Authorization:'Bearer '+session.access_token}:{})}});
  const data=await response.json();if(!response.ok){if(data.membership)status=data.membership;draw();if([401,403,429].includes(response.status)){show();message(data.error);}throw Error(data.error||'Request failed');}return data;
}
async function refresh(){
  const {data:{session}}=await client.auth.getSession();user=session?.user;status=user?await api('/api/account'):null;draw();window.dispatchEvent(new Event('membershipchange'));
}
async function action(fn){if(busy)return;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);message('Please wait…');try{await fn();}catch(e){message(e.message||'Please try again');}finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}}
$('accountForm').onsubmit=e=>{e.preventDefault();action(async()=>{const {error}=await client.auth.signInWithPassword({email:$('accountEmail').value.trim(),password:$('accountPassword').value});$('accountPassword').value='';if(error)throw error;await refresh();message('Signed in.');dialog.close();});};
$('accountSignup').onclick=()=>action(async()=>{if(!$('accountEmail').reportValidity()||!$('accountPassword').reportValidity())return;const {error}=await client.auth.signUp({email:$('accountEmail').value.trim(),password:$('accountPassword').value,options:{emailRedirectTo:native()?nativeRedirect:location.origin+'/'}});$('accountPassword').value='';if(error)throw error;message('Check your email to verify your account, then sign in.');});
$('accountReset').onclick=()=>action(async()=>{if(!$('accountEmail').reportValidity())return;const {error}=await client.auth.resetPasswordForEmail($('accountEmail').value.trim(),{redirectTo:native()?nativeRedirect:location.origin+'/?recover=1'});if(error)throw error;message('If an account exists, a recovery email will arrive shortly.');});
$('accountLogout').onclick=()=>action(async()=>{const {error}=await client.auth.signOut();if(error)throw error;user=null;status=null;draw();message('Signed out.');window.dispatchEvent(new Event('membershipchange'));});
dialog.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>action(async()=>{if(native()){await buyNative(b.dataset.plan,user,config.stores,api);await refresh();message(status?.plan==='premium'?'Premium is active.':'Your purchase is pending confirmation. Use Restore purchases to check again.');return;}const data=await api('/api/billing/checkout',{method:'POST',body:JSON.stringify({interval:b.dataset.plan})});location.assign(data.url);}));
$('accountPortal').onclick=()=>action(async()=>{if(native()){await manageNative();return;}const data=await api('/api/billing/portal',{method:'POST'});location.assign(data.url);});
restoreButton.onclick=()=>action(async()=>{if(!user)throw Error('Sign in before restoring purchases');const count=await restoreNative(user,api);await refresh();message(count?'Purchases checked with the store.':'No purchases linked to this StreamUnify account were found.');});
deleteButton.onclick=()=>action(async()=>{if(!window.confirm('Delete your StreamUnify account and saved watchlist permanently? This does not cancel subscriptions. Cancel any subscription in its original store or Manage subscription before deleting.'))return;await api('/api/account/delete',{method:'POST',body:JSON.stringify({confirmation:'DELETE'})});await client.auth.signOut({scope:'local'});user=null;status=null;draw();message('Your StreamUnify account has been deleted.');});
$('accountImport').onclick=()=>action(async()=>{let saved={};try{saved=JSON.parse(localStorage.getItem('su_saved_titles')||'{}');}catch{}for(const item of Object.values(saved))await api('/api/watchlist',{method:'POST',body:JSON.stringify(item)});message('Saved titles imported. The original device copy is preserved.');window.dispatchEvent(new Event('membershipchange'));});
window.StreamUnifyMembership={get enabled(){return !!config?.enabled;},get premium(){return status?.plan==='premium';},get status(){return status;},show,api,async search(url,searchId){const data=await api(url,{headers:searchId?{'X-Search-Id':searchId}:{}});if(data.membership){status=data.membership;draw();}return data;},async watchlist(){return (await api('/api/watchlist')).items.map(row=>row.snapshot);},async save(item,remove){await api('/api/watchlist'+(remove?'?id='+encodeURIComponent(item.id):''),{method:remove?'DELETE':'POST',...(remove?{}:{body:JSON.stringify(item)})});}};
window.membershipReady=(async()=>{
  config=await fetch(apiBase+'/api/account/config').then(r=>{if(!r.ok)throw Error('Account configuration unavailable');return r.json();});
  if(!config.enabled)return;
  await prepareNativeStorage();
  if(native())$('signupPricing').textContent='Premium includes unlimited searches, all supported providers, and your synced watchlist. Store pricing is shown after sign-in.';
  if(native())$('membershipPriceNote').textContent='Your store displays the subscription price and currency before purchase. Subscriptions renew until canceled in the original store. Streaming service subscriptions are separate.';
  client=createClient(config.supabaseUrl,config.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:!native(),...(native()?{storage:createNativeSessionStorage()}: {})}});
  button.hidden=false;
  client.auth.onAuthStateChange((event)=>{
    if(event==='PASSWORD_RECOVERY')setTimeout(()=>{show();const input=$('accountPassword');input.value='';$('accountFields').hidden=false;$('accountPlans').hidden=true;$('accountEmail').required=false;$('accountForm').onsubmit=e=>{e.preventDefault();action(async()=>{const {error}=await client.auth.updateUser({password:input.value});input.value='';if(error)throw error;message('Password updated.');await client.auth.signOut();location.assign('/');});};$('accountForm').querySelector('[type=submit]').textContent='Save new password';message('Enter a new password of at least 12 characters.');},0);
    else if(['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED'].includes(event))setTimeout(()=>refresh().catch(e=>message(e.message)),0);
  });
  await configureNativeAuth(client,message);
  if(native()){try{storePrices=await nativeProducts(config.stores);}catch{message('Store pricing is temporarily unavailable.');}await listenNativePurchases(()=>user,api,refresh,message);}
  try{await refresh();}catch(e){message(e.message);}
})().catch(()=>{config={enabled:true};button.hidden=false;button.textContent='Account unavailable';button.onclick=()=>{show();message('Account service is temporarily unavailable. Please try again shortly.');};});

import {createClient} from '@supabase/supabase-js';
import {needsPasswordSetup,sendSignupEmail,saveVerifiedPassword} from './signup-flow.mjs';
import {isNative,nativePlatform,nativeRedirect,createNativeSessionStorage,prepareNativeStorage,configureNativeAuth,nativeProducts,buyNative,restoreNative,listenNativePurchases,manageNative} from './native-client.mjs';
const apiBase=(window.STREAMUNIFY_API_BASE||'').replace(/\/$/,'');
let client,config,status,user,busy=false;
const native=isNative;
const button=document.createElement('button');button.type='button';button.className='su-action';button.textContent='Account';button.hidden=true;
document.querySelector('.su-discover')?.append(button);
const signupButton=document.createElement('button');signupButton.type='button';signupButton.className='su-action';signupButton.textContent='Sign up';signupButton.hidden=true;
document.querySelector('.su-discover')?.append(signupButton);
const dialog=document.createElement('dialog');dialog.className='membership-dialog';
dialog.innerHTML=`<form id="accountForm"><button type="button" id="accountClose" class="close" aria-label="Close account">×</button><h2 id="accountHeading">StreamUnify membership</h2><p id="accountStatus" role="status" aria-live="polite"></p><div id="accountFields"><section id="signupIntro" aria-label="Membership options"><p>Free membership: 10 searches per month across our 10 selected US providers.</p><p id="signupPricing"><strong>Premium: $2.99/month or $30/year</strong><br>Save $5.88 with annual billing. Unlimited searches, all supported providers, and your synced watchlist.</p><p>Paid plans renew until canceled; provider subscriptions are separate.</p><p id="signupWallets" hidden></p></section><label id="emailLabel">Email address<input id="accountEmail" type="email" autocomplete="email" required maxlength="254"></label><label id="passwordLabel">Password<input id="accountPassword" type="password" autocomplete="current-password" minlength="10" maxlength="128" required></label><p id="passwordHint" hidden>Use at least 12 characters.</p><label id="confirmLabel" hidden>Confirm password<input id="accountConfirm" type="password" autocomplete="new-password" minlength="12" maxlength="128"></label><section id="verificationInstructions" hidden><p>We’ve sent a verification link to <strong id="verificationEmail"></strong>.</p><div class="su-verification-note">Open the email from StreamUnify and select the verification link. You’ll then create your password.<br><br><strong>Can’t find it?</strong> Check your spam or junk folder. Delivery may take a few minutes. Open the link on the same device and browser where you requested it.</div><button type="button" id="accountResend">Resend verification email</button><button type="button" id="accountChangeEmail">Use a different email</button></section><button type="submit" id="accountSubmit" class="primary">Sign in</button><button type="button" id="accountSignup">Create a free account</button><button type="button" id="accountSignin" hidden>Already have an account? Sign in</button><button type="button" id="accountReset">Forgot password?</button></div><div id="accountPlans"><p>Free: 10 searches per month across the 10 selected US providers. Premium: unlimited searches, all supported providers, and your synced watchlist.</p><p id="membershipPriceNote"><strong>$2.99/month or $30/year</strong> — save $5.88 annually. Subscriptions renew until cancelled. Streaming service subscriptions are separate.</p><p id="accountWallets" hidden></p><button type="button" data-plan="monthly">Choose monthly</button><button type="button" data-plan="annual">Choose annual</button><button type="button" id="accountContinue">Continue with Free</button><button type="button" id="accountPortal">Manage subscription</button><button type="button" id="accountImport">Import this device’s saved titles</button><button type="button" id="accountLogout">Sign out</button></div><p><a href="https://www.streamunify.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a> · <a href="https://www.streamunify.com/terms" target="_blank" rel="noopener noreferrer">Membership terms</a></p><p id="accountMessage" role="status" aria-live="polite"></p></form>`;
document.body.append(dialog);
const restoreButton=document.createElement('button');restoreButton.type='button';restoreButton.textContent='Restore purchases';restoreButton.id='accountRestore';document.getElementById('accountPlans').append(restoreButton);
const deleteButton=document.createElement('button');deleteButton.type='button';deleteButton.textContent='Delete account';deleteButton.id='accountDelete';document.getElementById('accountPlans').append(deleteButton);
let storePrices={};
const $=id=>document.getElementById(id);
const message=text=>{$('accountMessage').textContent=text;};
let authView='signin',recovery=false,resendAt=0;
const show=()=>{if(!dialog.open)dialog.showModal();};
function setAuthView(view){
  authView=view;$('accountPassword').value='';$('accountConfirm').value='';message('');draw();
}
signupButton.onclick=()=>{if(!user)setAuthView('signup');show();if(!user)$('accountEmail').focus();};
button.onclick=()=>{if(!user&&authView!=='checkemail')setAuthView('signin');show();};
$('accountClose').onclick=()=>dialog.close();
$('accountSignup').onclick=()=>setAuthView('signup');
$('accountSignin').onclick=()=>setAuthView('signin');
$('accountChangeEmail').onclick=()=>setAuthView('signup');
$('accountContinue').onclick=()=>dialog.close();
function draw(){
  const setup=authView==='password',waiting=authView==='checkemail',signup=authView==='signup';
  signupButton.hidden=!!user;
  button.textContent=user?(status?.plan==='premium'?'Premium':'My account'):'Sign in';
  $('accountHeading').textContent=setup?(recovery?'Reset your password':'Email verified'):waiting?'Check your email':signup?'Create your account':user?(authView==='welcome'?'You’re all set':'Your membership'):'Sign in';
  $('accountFields').hidden=!!user&&!setup;$('accountPlans').hidden=!user||setup;
  $('signupIntro').hidden=setup||waiting;
  $('emailLabel').hidden=setup||waiting;$('accountEmail').required=!setup&&!waiting&&!user;
  $('passwordLabel').hidden=signup||waiting;$('accountPassword').required=setup||(!user&&!signup&&!waiting);
  $('passwordLabel').firstChild.textContent=setup?(recovery?'New password':'Create password'):'Password';
  $('accountPassword').autocomplete=setup?'new-password':'current-password';$('accountPassword').minLength=setup?12:10;
  $('confirmLabel').hidden=!setup;$('accountConfirm').required=setup;$('passwordHint').hidden=!setup;
  $('verificationInstructions').hidden=!waiting;$('verificationEmail').textContent=$('accountEmail').value.trim();
  $('accountSubmit').hidden=waiting;$('accountSubmit').textContent=setup?(recovery?'Save new password':'Create account'):signup?'Send verification link':'Sign in';
  $('accountSignup').hidden=signup||waiting||setup;$('accountSignin').hidden=!signup&&!waiting;$('accountReset').hidden=signup||waiting||setup;
  $('accountStatus').textContent=setup?'Your email is verified. Choose a password and enter it again to confirm.':waiting?'Waiting for email verification.':signup?'Start with your email. We’ll verify it before you create a password.':!user?'Sign in to your StreamUnify account.':status?.plan==='premium'?'Premium is active.':`${status?.remaining??10} of 10 searches remaining.${status?.reset_at?' Resets '+new Date(status.reset_at).toLocaleString()+'.':''}`;
  const store=nativePlatform()==='ios'?'apple':'google';
  const billingAvailable=native()?!!config?.stores?.[store]:!!config?.billingEnabled;
  $('accountWallets').hidden=!billingAvailable;
  $('accountWallets').textContent=native()?(store==='apple'?'Subscribe through the App Store using your saved Apple Account payment method.':'Subscribe through Google Play using your saved payment method.'):'Pay securely with Apple Pay or a card. Apple Pay appears at checkout on supported devices with a saved payment method.';
  $('signupWallets').hidden=native()||!billingAvailable;$('signupWallets').textContent='Apple Pay and cards accepted at secure checkout. Wallet availability depends on your device and saved payment methods.';
  dialog.querySelectorAll('[data-plan]').forEach(b=>{b.hidden=status?.plan==='premium'||(native()?!config?.stores?.[store]||!storePrices[b.dataset.plan]:!config?.billingEnabled);b.textContent=native()?`${storePrices[b.dataset.plan]?.priceString||''} / ${b.dataset.plan==='monthly'?'month':'year'}`:`Choose ${b.dataset.plan}`;});
  $('accountPortal').hidden=!billingAvailable;
  restoreButton.hidden=!native()||!config?.stores?.[store];
  $('accountContinue').hidden=status?.plan==='premium';
  $('accountImport').hidden=status?.plan!=='premium';
}
async function api(path,options={}){
  const {data:{session}}=await client.auth.getSession();
  const response=await fetch(apiBase+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers,...(session?{Authorization:'Bearer '+session.access_token}:{})}});
  const data=await response.json();if(!response.ok){if(data.membership)status=data.membership;draw();if([401,403,429].includes(response.status)){show();message(data.error);}throw Error(data.error||'Request failed');}return data;
}
async function refresh(){
  const {data:{session}}=await client.auth.getSession();user=session?.user;if(needsPasswordSetup(user)&&authView!=='password'){authView='password';show();}status=user?await api('/api/account'):null;draw();window.dispatchEvent(new Event('membershipchange'));
}
async function action(fn){if(busy)return;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);message('Please wait…');try{await fn();}catch(e){message(e.message||'Please try again');}finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}}
const signupRedirect=()=>native()?nativeRedirect:location.origin+'/';
async function requestSignup(){
  if(!$('accountEmail').reportValidity())return;
  if(Date.now()<resendAt)throw Error('Please wait a minute before requesting another verification email.');
  await sendSignupEmail(client,$('accountEmail').value.trim(),signupRedirect());
  resendAt=Date.now()+60000;setAuthView('checkemail');message('Verification email sent. Check your inbox and spam or junk folder.');
}
$('accountResend').onclick=()=>action(requestSignup);
$('accountForm').onsubmit=e=>{e.preventDefault();action(async()=>{
  if(authView==='signup'){await requestSignup();return;}
  if(authView==='password'){
    await saveVerifiedPassword(client,$('accountPassword').value,$('accountConfirm').value);
    $('accountPassword').value='';$('accountConfirm').value='';recovery=false;authView='welcome';await refresh();
    message('Your password has been saved. Your account is ready. Continue with Free or choose Premium.');return;
  }
  if(authView==='checkemail')return;
  const {error}=await client.auth.signInWithPassword({email:$('accountEmail').value.trim(),password:$('accountPassword').value});$('accountPassword').value='';if(error)throw error;await refresh();
  if(authView!=='password'){message('Signed in.');dialog.close();}
});};
$('accountReset').onclick=()=>action(async()=>{if(!$('accountEmail').reportValidity())return;const {error}=await client.auth.resetPasswordForEmail($('accountEmail').value.trim(),{redirectTo:native()?nativeRedirect:location.origin+'/?recover=1'});if(error)throw error;message('If an account exists, a recovery email will arrive shortly.');});
$('accountLogout').onclick=()=>action(async()=>{const {error}=await client.auth.signOut();if(error)throw error;user=null;status=null;setAuthView('signin');message('Signed out.');window.dispatchEvent(new Event('membershipchange'));});
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
  button.hidden=false;signupButton.hidden=false;
  client.auth.onAuthStateChange((event)=>{
    if(event==='PASSWORD_RECOVERY')setTimeout(()=>{recovery=true;setAuthView('password');show();refresh().catch(e=>message(e.message));},0);
    else if(['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(event))setTimeout(()=>refresh().catch(e=>message(e.message)),0);
  });
  await configureNativeAuth(client,text=>{if(!user)setAuthView('signup');show();message(text);});
  if(native()){try{storePrices=await nativeProducts(config.stores);}catch{message('Store pricing is temporarily unavailable.');}await listenNativePurchases(()=>user,api,refresh,message);}
  try{await refresh();}catch(e){message(e.message);}
  if(!native()&&new URLSearchParams(location.search).has('error')){if(!user)setAuthView('signup');show();message('This email link has expired or could not be verified. Enter your email and request a new link. Open it on this device and browser.');history.replaceState(null,'',location.pathname);}
})().catch(()=>{config={enabled:true};button.hidden=false;button.textContent='Account unavailable';button.onclick=()=>{show();message('Account service is temporarily unavailable. Please try again shortly.');};});

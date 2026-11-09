import {accountFetch} from './account-network.mjs';
import {nativePlanText} from './native-price-display.mjs';
import {createClient} from '@supabase/supabase-js';
import {createRecentSearches} from './recent-searches-client.mjs';
import {needsPasswordSetup,sendSignupEmail,saveVerifiedPassword,readPendingSignup,savePendingSignup,signupErrorMessage} from './signup-flow.mjs';
import {isNative,nativePlatform,nativeRedirect,nativeSignupRedirect,createNativeSessionStorage,prepareNativeStorage,configureNativeAuth,nativeProducts,buyNative,restoreNative,listenNativePurchases,manageNative} from './native-client.mjs';
const apiBase=(window.STREAMUNIFY_API_BASE||'').replace(/\/$/,'');
let client,config,status,user,busy=false;
const recentSearches=createRecentSearches({api,identity:()=>user?.id,runSearch:query=>{
  const input=document.getElementById('search');input.value=query;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  document.getElementById('suSearchButton').click();
}});
window.addEventListener('membershipchange',()=>recentSearches.reload());
const native=isNative;
const button=document.createElement('button');button.type='button';button.className='su-action';button.textContent='Account';button.hidden=true;
document.querySelector('.su-discover')?.append(button);
const signupButton=document.createElement('button');signupButton.type='button';signupButton.className='su-action';signupButton.textContent='Sign up';signupButton.hidden=true;
document.querySelector('.su-discover')?.append(signupButton);
const dialog=document.createElement('dialog');dialog.className='membership-dialog';
dialog.innerHTML=`<form id="accountForm"><button type="button" id="accountClose" class="close" aria-label="Close account">×</button><h2 id="accountHeading">StreamUnify membership</h2><p id="accountStatus" role="status" aria-live="polite"></p><div id="accountFields"><section id="signupIntro" aria-label="Membership options"><p id="signupFreeTier">Free membership: 10 searches per month across our 10 selected US providers.</p><p id="signupPricing"><strong>Premium: $2.99/month or $30/year</strong><br>Save $5.88 (16%) with annual billing versus $35.88 over 12 monthly payments. Unlimited searches, all supported providers, and your synced watchlist.</p><p id="signupRenewal">Paid plans renew until canceled; provider subscriptions are separate.</p><p id="signupWallets" hidden></p></section><label id="emailLabel">Email address<input id="accountEmail" type="email" autocomplete="email" required maxlength="254"></label><label id="passwordLabel">Password<input id="accountPassword" type="password" autocomplete="current-password" minlength="10" maxlength="128" required></label><p id="passwordHint" hidden>Use at least 10 characters.</p><label id="confirmLabel" hidden>Confirm password<input id="accountConfirm" type="password" autocomplete="new-password" minlength="10" maxlength="128"></label><section id="verificationInstructions" hidden><p>We’ve sent a verification link to <strong id="verificationEmail"></strong>.</p><div class="su-verification-note">Open the email from StreamUnify and select the verification link. You’ll then create your password.<br><br><strong>Can’t find it?</strong> Check your spam or junk folder. Delivery may take a few minutes. Finish creating your password on the page opened by the verification link. If an older link fails, request a fresh one below.</div><button type="button" id="accountResend">Resend verification email</button><button type="button" id="accountChangeEmail">Use a different email</button></section><button type="submit" id="accountSubmit" class="primary">Sign in</button><button type="button" id="accountSignup">Create a free account</button><button type="button" id="accountSignin" hidden>Already have an account? Sign in</button><button type="button" id="accountReset">Forgot password?</button></div><div id="accountPlans"><p id="accountPlanSummary">Free: 10 searches per month across the 10 selected US providers. Premium: unlimited searches, all supported providers, and your synced watchlist.</p><p id="membershipPriceNote"><strong>$2.99/month or $30/year</strong> — save $5.88 (16%) annually versus $35.88 over 12 monthly payments. Subscriptions renew until cancelled. Streaming service subscriptions are separate.</p><p id="accountWallets" hidden></p><button type="button" data-plan="monthly">Choose monthly</button><button type="button" data-plan="annual">Choose annual</button><button type="button" id="accountContinue">Continue with Free</button><button type="button" id="accountPortal">Manage subscription</button><button type="button" id="accountImport">Import this device’s saved titles</button><button type="button" id="accountLogout">Sign out</button></div><p><a href="https://www.streamunify.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a> · <a href="https://www.streamunify.com/terms" target="_blank" rel="noopener noreferrer">Membership terms</a></p><p id="accountMessage" role="status" aria-live="polite"></p></form>`;
document.body.append(dialog);
const restoreButton=document.createElement('button');restoreButton.type='button';restoreButton.textContent='Restore purchases';restoreButton.id='accountRestore';document.getElementById('accountPlans').append(restoreButton);
const deleteButton=document.createElement('button');deleteButton.type='button';deleteButton.textContent='Delete account';deleteButton.id='accountDelete';document.getElementById('accountPlans').append(deleteButton);
let storePrices={},storePricesState='loading';
const $=id=>document.getElementById(id);
const message=text=>{$('accountMessage').textContent=text;};
let authView='signin',recovery=false,resendAt=0;
let signupStorage;try{signupStorage=sessionStorage;}catch{}
const pendingSignup=readPendingSignup(signupStorage);
if(pendingSignup){$('accountEmail').value=pendingSignup.email;authView='checkemail';resendAt=pendingSignup.sentAt+60000;}
const trackSignup=stage=>window.dispatchEvent(new CustomEvent('su-signup-stage',{detail:{stage}}));
function drawResend(){
  const seconds=Math.max(0,Math.ceil((resendAt-Date.now())/1000));
  $('accountResend').disabled=busy||seconds>0;
  $('accountResend').textContent=seconds?`Resend available in ${seconds}s`:'Resend verification email';
}
setInterval(()=>{if(dialog.open&&authView==='checkemail')drawResend();},1000);
let selectedPlan;try{selectedPlan=sessionStorage.getItem('su_selected_plan');}catch{}
if(!['monthly','annual'].includes(selectedPlan))selectedPlan=null;
const show=()=>{if(!dialog.open)dialog.showModal();};
// Homepage plans only open the existing account flow. They never initiate checkout.
function drawHomepagePlans(){
  const onDevice=native(),freeLaunch=config?.freeLaunch===true;
  document.querySelectorAll('[data-su-paid-only]').forEach(el=>{el.hidden=!config||freeLaunch;});
  document.querySelectorAll('[data-su-free-launch]').forEach(el=>{el.hidden=!freeLaunch;});
  document.querySelectorAll('[data-su-web-pricing]').forEach(el=>{el.hidden=freeLaunch;});
  document.querySelectorAll('[data-su-web-reference]').forEach(el=>{el.hidden=freeLaunch||!onDevice;});
  document.querySelectorAll('[data-su-store-price]').forEach(el=>{
    const interval=el.dataset.suStorePrice;
    el.hidden=freeLaunch||!onDevice;
    el.textContent=(nativePlatform()==='ios'?'App Store: ':'Google Play: ')+nativePlanText(interval,{configLoaded:!!config,enabled:config?.stores?.[nativePlatform()==='ios'?'apple':'google'],state:storePricesState,products:storePrices});
  });
  const available=!!config?.enabled&&!!client;
  document.querySelectorAll('[data-su-membership]').forEach(el=>{
    el.disabled=!available||busy;
    if(freeLaunch&&['monthly','annual'].includes(el.dataset.suMembership))el.hidden=true;
    el.onclick=()=>{
      if(!config?.enabled||!client||busy)return;
      selectedPlan=!freeLaunch&&['monthly','annual'].includes(el.dataset.suMembership)?el.dataset.suMembership:null;
      try{if(selectedPlan)sessionStorage.setItem('su_selected_plan',selectedPlan);else sessionStorage.removeItem('su_selected_plan');}catch{}
      if(!user&&!['checkemail','password'].includes(authView))setAuthView('signup');
      show();
      if(!user&&!['checkemail','password'].includes(authView))$('accountEmail').focus();
    };
  });
  const note=$('suPlansStatus');
  if(note)note.textContent=!config?'Checking membership availability…':!config.enabled?'Membership enrollment is not enabled yet. You can continue exploring StreamUnify.':!client?'Account service is temporarily unavailable. Please try again shortly.':freeLaunch?'Unlimited searches and watchlists during the free launch period. Sign in or create an account to save your watchlist. Streaming provider subscriptions are separate.':'Provider subscriptions are separate. Paid plans renew until canceled.';
}
drawHomepagePlans();

function setAuthView(view){
  authView=view;$('accountPassword').value='';$('accountConfirm').value='';message('');draw();
}
signupButton.onclick=()=>{if(!user)setAuthView('signup');show();if(!user)$('accountEmail').focus();};
button.onclick=()=>{if(!user&&authView!=='checkemail')setAuthView('signin');show();if(user)refresh().catch(e=>message(e.message));};
$('accountClose').onclick=()=>dialog.close();
$('accountSignup').onclick=()=>setAuthView('signup');
$('accountSignin').onclick=()=>setAuthView('signin');
$('accountChangeEmail').onclick=()=>{savePendingSignup(signupStorage,null);setAuthView('signup');};
$('accountContinue').onclick=()=>dialog.close();
function draw(){
  drawHomepagePlans();
  const freeLaunch=config?.freeLaunch===true;
  $('signupFreeTier').hidden=freeLaunch;$('signupRenewal').hidden=freeLaunch;
  $('accountPlanSummary').hidden=freeLaunch;
  if(freeLaunch){$('signupPricing').textContent='Free launch access — Unlimited searches and watchlists during the free launch period. Streaming provider subscriptions are separate.';$('membershipPriceNote').textContent='Free launch access — Unlimited searches and watchlists during the free launch period. Streaming provider subscriptions are separate.';}
  const setup=authView==='password',waiting=authView==='checkemail',signup=authView==='signup';
  signupButton.hidden=!!user;
  button.textContent=user?(status?.free_launch===true?'Free launch access':status?.plan==='premium'?'Premium':'My account'):'Sign in';
  $('accountHeading').textContent=setup?(recovery?'Reset your password':'Email verified'):waiting?'Check your email':signup?'Create your account':user?(authView==='welcome'?'You’re all set':'Your membership'):'Sign in';
  $('accountFields').hidden=!!user&&!setup;$('accountPlans').hidden=!user||setup;
  $('signupIntro').hidden=setup||waiting||(!signup&&authView==='signin');
  $('emailLabel').hidden=setup||waiting;$('accountEmail').required=!setup&&!waiting&&!user;
  $('passwordLabel').hidden=signup||waiting;$('accountPassword').required=setup||(!user&&!signup&&!waiting);
  $('passwordLabel').firstChild.textContent=setup?(recovery?'New password':'Create password'):'Password';
  $('accountPassword').autocomplete=setup?'new-password':'current-password';$('accountPassword').minLength=10;
  $('confirmLabel').hidden=!setup;$('accountConfirm').required=setup;$('passwordHint').hidden=!setup;
  $('verificationInstructions').hidden=!waiting;$('verificationEmail').textContent=$('accountEmail').value.trim();
  drawResend();
  $('accountSubmit').hidden=waiting;$('accountSubmit').textContent=setup?(recovery?'Save new password':'Create account'):signup?'Send verification link':'Sign in';
  $('accountSignup').hidden=signup||waiting||setup;$('accountSignin').hidden=!signup&&!waiting;$('accountReset').hidden=signup||waiting||setup;
  $('accountStatus').textContent=setup?'Your email is verified. Choose a password and enter it again to confirm.':waiting?'Waiting for email verification.':signup?'Start with your email. We’ll verify it before you create a password.':!user?'Sign in to your StreamUnify account.':status?.free_launch===true?'Unlimited searches and watchlists during the free launch period.':status?.plan==='premium'?'Premium is active.':`${status?.remaining??10} of 10 searches remaining.${status?.reset_at?' Resets '+new Date(status.reset_at).toLocaleString()+'.':''}`;
  const store=nativePlatform()==='ios'?'apple':'google';
  const billingAvailable=native()?!!config?.stores?.[store]:!!config?.billingEnabled;
  $('accountWallets').hidden=freeLaunch||!billingAvailable;
  $('accountWallets').textContent=native()?(store==='apple'?'Subscribe through the App Store using your saved Apple Account payment method.':'Subscribe through Google Play using your saved payment method.'):'Pay securely with Apple Pay or a card. Apple Pay appears at checkout on supported devices with a saved payment method.';
  $('signupWallets').hidden=freeLaunch||native()||!billingAvailable;$('signupWallets').textContent='Apple Pay and cards accepted at secure checkout. Wallet availability depends on your device and saved payment methods.';
  dialog.querySelectorAll('[data-plan]').forEach(b=>{b.hidden=freeLaunch||status?.plan==='premium'||(native()?!config?.stores?.[store]||!storePrices[b.dataset.plan]:!config?.billingEnabled);b.textContent=native()?`${storePrices[b.dataset.plan]?.priceString||''} / ${b.dataset.plan==='monthly'?'month':'year'}`:`Choose ${b.dataset.plan}${selectedPlan===b.dataset.plan?' (selected)':''}`;});
  $('accountPortal').hidden=native()?!(freeLaunch||billingAvailable):!(config?.billingManagementEnabled??config?.billingEnabled);
  $('accountPortal').textContent=freeLaunch&&native()?'Manage store subscriptions':'Manage subscription';
  restoreButton.hidden=freeLaunch||!native()||!config?.stores?.[store];
  $('accountContinue').hidden=!freeLaunch&&status?.plan==='premium';
  $('accountContinue').textContent=freeLaunch?'Continue exploring':'Continue with Free';
  $('accountImport').hidden=status?.plan!=='premium';
}
async function api(path,options={}){
  const {data:{session}}=await client.auth.getSession();
  const response=await accountFetch(apiBase+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers,...(session?{Authorization:'Bearer '+session.access_token}:{})}});
  const data=await response.json();if(!response.ok){if(data.membership)status=data.membership;draw();if([401,403,429].includes(response.status)){show();message(data.error);}throw Error(data.error||'Request failed');}return data;
}
async function refresh(){
  const {data:{session}}=await client.auth.getSession();user=session?.user;if(needsPasswordSetup(user)&&authView!=='password'){authView='password';show();}draw();status=user?await api('/api/account'):null;draw();window.dispatchEvent(new Event('membershipchange'));
}
async function action(fn){if(busy)return;busy=true;dialog.querySelectorAll('button:not(#accountClose)').forEach(b=>b.disabled=true);message('Please wait…');try{await fn();}catch(e){message(signupErrorMessage(e));}finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);drawResend();drawHomepagePlans();}}
const signupRedirect=()=>native()?nativeSignupRedirect():location.origin+'/';
async function requestSignup(){
  if(!$('accountEmail').reportValidity())return;
  if(Date.now()<resendAt)throw Error('Please wait a minute before requesting another verification email.');
  trackSignup('email_requested');
  try{await sendSignupEmail(client,$('accountEmail').value.trim(),signupRedirect());}
  catch(error){trackSignup('email_request_failed');throw error;}
  const sentAt=Date.now();savePendingSignup(signupStorage,{email:$('accountEmail').value.trim(),sentAt});
  trackSignup('email_request_accepted');resendAt=sentAt+60000;setAuthView('checkemail');message('Verification email requested. Check your inbox and spam or junk folder. Use the newest email; delivery may take a few minutes.');
}
$('accountResend').onclick=()=>action(requestSignup);
$('accountForm').onsubmit=e=>{e.preventDefault();action(async()=>{
  if(authView==='signup'){await requestSignup();return;}
  if(authView==='password'){
    const completingSignup=!recovery&&needsPasswordSetup(user);
    await saveVerifiedPassword(client,$('accountPassword').value,$('accountConfirm').value);
    savePendingSignup(signupStorage,null);if(completingSignup)trackSignup('completed');
    $('accountPassword').value='';$('accountConfirm').value='';recovery=false;authView='welcome';await refresh();
    message(config?.freeLaunch?'Your password has been saved. Your account is ready. Enjoy unlimited searches and watchlists during the free launch period.':'Your password has been saved. Your account is ready. Continue with Free or choose Premium.');return;
  }
  if(authView==='checkemail')return;
  const {error}=await client.auth.signInWithPassword({email:$('accountEmail').value.trim(),password:$('accountPassword').value});$('accountPassword').value='';if(error)throw error;await refresh();
  if(authView!=='password'){message('Signed in.');dialog.close();}
});};
$('accountReset').onclick=()=>action(async()=>{if(!$('accountEmail').reportValidity())return;const {error}=await client.auth.resetPasswordForEmail($('accountEmail').value.trim(),{redirectTo:native()?nativeRedirect:location.origin+'/?recover=1'});if(error)throw error;message('If an account exists, a recovery email will arrive shortly.');});
$('accountLogout').onclick=()=>action(async()=>{const {error}=await client.auth.signOut();if(error)throw error;user=null;status=null;setAuthView('signin');message('Signed out.');window.dispatchEvent(new Event('membershipchange'));});
dialog.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>action(async()=>{if(config?.freeLaunch)throw Error('Free launch access is active. No purchase is needed.');if(native()){await buyNative(b.dataset.plan,user,config.stores,api);await refresh();message(status?.plan==='premium'?'Premium is active.':'Your purchase is pending confirmation. Use Restore purchases to check again.');return;}const data=await api('/api/billing/checkout',{method:'POST',body:JSON.stringify({interval:b.dataset.plan})});location.assign(data.url);}));
$('accountPortal').onclick=()=>action(async()=>{if(native()){await manageNative();return;}const data=await api('/api/billing/portal',{method:'POST'});location.assign(data.url);});
restoreButton.onclick=()=>action(async()=>{if(!user)throw Error('Sign in before restoring purchases');const count=await restoreNative(user,api);await refresh();message(count?'Purchases checked with the store.':'No purchases linked to this StreamUnify account were found.');});
deleteButton.onclick=()=>action(async()=>{if(!window.confirm('Delete your StreamUnify account, saved watchlist and availability alerts permanently? This does not cancel subscriptions. Cancel any subscription in its original store or Manage subscription before deleting.'))return;await api('/api/account/delete',{method:'POST',body:JSON.stringify({confirmation:'DELETE'})});await client.auth.signOut({scope:'local'});user=null;status=null;draw();message('Your StreamUnify account has been deleted.');});
$('accountImport').onclick=()=>action(async()=>{let saved={};try{saved=JSON.parse(localStorage.getItem('su_saved_titles')||'{}');}catch{}for(const item of Object.values(saved))await api('/api/watchlist',{method:'POST',body:JSON.stringify(item)});message('Saved titles imported. The original device copy is preserved.');window.dispatchEvent(new Event('membershipchange'));});
window.StreamUnifyMembership={get enabled(){return !!config?.enabled;},get premium(){return status?.plan==='premium';},get freeLaunch(){return config?.freeLaunch===true;},get status(){return status;},show,api,async search(url,searchId){const searchOwner=user?.id;const data=await api(url,{headers:searchId?{'X-Search-Id':searchId}:{}});if(data.membership){status=data.membership;draw();}if(searchId&&searchOwner===user?.id)recentSearches.reload();return data;},async watchlist(rating=''){return (await api('/api/watchlist'+(rating?'?rating='+encodeURIComponent(rating):''))).items.map(row=>row.snapshot);},async save(item,remove){await api('/api/watchlist'+(remove?'?id='+encodeURIComponent(item.id):''),{method:remove?'DELETE':'POST',...(remove?{}:{body:JSON.stringify(item)})});}};
window.membershipReady=(async()=>{
  config=await accountFetch(apiBase+'/api/account/config').then(r=>{if(!r.ok)throw Error('Account configuration unavailable');return r.json();});
  drawHomepagePlans();
  if(!config.enabled)return;
  await prepareNativeStorage();
  if(native()&&!config.freeLaunch)$('signupPricing').textContent='Premium includes unlimited searches, all supported providers, and your synced watchlist. Store pricing is shown after sign-in.';
  if(native()&&!config.freeLaunch)$('membershipPriceNote').textContent='Your store displays the subscription price and currency before purchase. Subscriptions renew until canceled in the original store. Streaming service subscriptions are separate.';
  client=createClient(config.supabaseUrl,config.publishableKey,{global:{fetch:accountFetch},auth:{flowType:native()?'pkce':'implicit',persistSession:true,autoRefreshToken:true,detectSessionInUrl:!native(),...(native()?{storage:createNativeSessionStorage()}: {})}});
  button.hidden=false;signupButton.hidden=false;
  client.auth.onAuthStateChange((event)=>{
    if(event==='PASSWORD_RECOVERY')setTimeout(()=>{recovery=true;setAuthView('password');show();refresh().catch(e=>message(e.message));},0);
    else if(['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(event))setTimeout(()=>refresh().catch(e=>message(e.message)),0);
  });
  if(!native()){
    const verificationUrl=new URL(location.href),tokenHash=verificationUrl.searchParams.get('token_hash'),tokenType=verificationUrl.searchParams.get('type');
    if(tokenHash&&['email','recovery'].includes(tokenType)){
      const {error}=await client.auth.verifyOtp({token_hash:tokenHash,type:tokenType});
      verificationUrl.searchParams.delete('token_hash');verificationUrl.searchParams.delete('type');
      history.replaceState(null,'',verificationUrl.pathname+verificationUrl.search+verificationUrl.hash);
      if(error){if(!user)setAuthView('signup');show();message('This email link has expired or could not be verified. Request a new link and use the newest email.');}
    }
  }
  await configureNativeAuth(client,text=>{if(!user)setAuthView('signup');show();message(text);});
  if(native()){try{if(!config.freeLaunch)storePrices=await nativeProducts(config.stores);storePricesState='ready';}catch{storePricesState='unavailable';message('Store pricing is temporarily unavailable.');}finally{drawHomepagePlans();}await listenNativePurchases(()=>user,api,refresh,message);}
  try{await refresh();}catch(e){message(e.message);}
  if(!native()&&new URLSearchParams(location.search).has('billing')){
    const result=new URLSearchParams(location.search).get('billing');show();
    message(config?.freeLaunch?'Free launch access is active. Use Manage subscription to review any existing subscription.':result==='success'?(status?.plan==='premium'?'Payment confirmed. Premium is active.':'You returned from checkout. Premium is awaiting server confirmation. Open My account again shortly to refresh; do not submit another payment yet.'):'Checkout was cancelled. You have not completed a new purchase. Choose a plan when you’re ready.');
    const clean=new URL(location.href);clean.searchParams.delete('billing');history.replaceState(null,'',clean.pathname+clean.search+clean.hash);
  }
  if(!native()&&(new URLSearchParams(location.search).has('error')||new URLSearchParams(location.hash.slice(1)).has('error'))){if(!user)setAuthView('signup');show();message('This email link has expired or could not be verified. Enter your email and request a new link. Use the newest email only; older links may have expired or already been used.');history.replaceState(null,'',location.pathname);}
})().catch(()=>{config={enabled:true};drawHomepagePlans();button.hidden=false;button.textContent='Account unavailable';button.onclick=()=>{show();message('Account service is temporarily unavailable. Please try again shortly.');};});

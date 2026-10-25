let stripeScript;
export function loadStripeScript(){
 if(window.Stripe)return Promise.resolve(window.Stripe);
 if(!stripeScript)stripeScript=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://js.stripe.com/clover/stripe.js';script.async=true;
  const timer=setTimeout(()=>{script.remove();stripeScript=null;reject(Error('Secure checkout could not load. Please try again.'));},20000);
  script.onload=()=>{clearTimeout(timer);if(window.Stripe)resolve(window.Stripe);else{stripeScript=null;reject(Error('Secure checkout is unavailable.'));}};
  script.onerror=()=>{clearTimeout(timer);script.remove();stripeScript=null;reject(Error('Secure checkout could not load. Please try again.'));};document.head.append(script);
 });return stripeScript;
}
export async function mountCheckout({publishableKey,clientSecret,container,onComplete,load=loadStripeScript}){
 if(!/^pk_(live|test)_/.test(publishableKey||'')||!clientSecret)throw Error('Secure checkout is unavailable.');
 const Stripe=await load();const stripe=Stripe(publishableKey);
 const checkout=await stripe.initEmbeddedCheckout({clientSecret,onComplete});
 try{checkout.mount(container);}catch(e){checkout.destroy();throw e;}return checkout;
}

import Stripe from 'stripe';
import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {MembershipError} from './membership-policy.mjs';
const id=o=>typeof o==='string'?o:o?.id;
export function createBilling({env=process.env,stripeClient,dbClient}={}){
  const enabled=env.BILLING_ENABLED==='true';
  const origin=env.PUBLIC_ORIGIN||'https://streamunify.com';
  const prices={monthly:env.STRIPE_MONTHLY_PRICE_ID,annual:env.STRIPE_ANNUAL_PRICE_ID};
  const mode=env.STRIPE_MODE||'test';
  if(enabled&&new URL(origin).protocol!=='https:')throw Error('Billing requires an HTTPS origin');
  if(enabled&&(!env.STRIPE_API_KEY||!env.STRIPE_WEBHOOK_SECRET||!env.SUPABASE_SECRET_KEY||!prices.monthly||!prices.annual||!['test','live'].includes(mode)))throw Error('Billing environment is incomplete');
  if(enabled&&!new RegExp('^(rk|sk)_'+mode+'_').test(env.STRIPE_API_KEY))throw Error('Stripe key mode does not match STRIPE_MODE');
  const stripe=stripeClient||(enabled?new Stripe(env.STRIPE_API_KEY,{apiVersion:'2026-08-26.dahlia',maxNetworkRetries:2}):null);
  const db=dbClient||(enabled?createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}):null);
  const requireEnabled=()=>{if(!enabled)throw new MembershipError(503,'billing_unavailable','Membership checkout is not available yet');};
  const publishableKey=/^pk_(test|live)_/.test(env.STRIPE_PUBLISHABLE_KEY||'')&&env.STRIPE_PUBLISHABLE_KEY.startsWith('pk_'+mode+'_')?env.STRIPE_PUBLISHABLE_KEY:null;
  const embeddedEnabled=enabled&&env.STRIPE_EMBEDDED_ENABLED==='true'&&!!publishableKey;
  const integration='streamunify_membership_'+Array.from(randomBytes(8),n=>String.fromCharCode(97+n%26)).join('');
  const pending=new Map();
  async function serialize(userId,fn){const previous=pending.get(userId)||Promise.resolve();const task=previous.catch(()=>{}).then(fn);pending.set(userId,task);try{return await task;}finally{if(pending.get(userId)===task)pending.delete(userId);}}
  async function customer(actor,create=false){
    const {data,error}=await db.from('billing_customers').select('customer_id').eq('user_id',actor.id).maybeSingle();if(error)throw Error('Billing lookup failed');
    if(data)return data.customer_id;
    if(!create)throw new MembershipError(404,'no_subscription','No web subscription found');
    const customer=await stripe.customers.create({email:actor.email,metadata:{streamunify_user_id:actor.id}},{idempotencyKey:'streamunify-customer-'+actor.id});
    const saved=await db.from('billing_customers').upsert({user_id:actor.id,customer_id:customer.id},{onConflict:'user_id'});if(saved.error)throw Error('Billing lookup failed');return customer.id;
  }
  return {enabled,publicConfig:()=>({embeddedEnabled,...(embeddedEnabled?{publishableKey}: {})}),
    async verifyConnections(){
      requireEnabled();
      await Promise.all([
        stripe.customers.list({limit:1}),
        stripe.subscriptions.list({limit:1}),
        stripe.checkout.sessions.list({limit:1}),
        stripe.invoices.list({limit:1}),
        ...(env.STRIPE_PORTAL_CONFIGURATION_ID?[stripe.billingPortal.configurations.retrieve(env.STRIPE_PORTAL_CONFIGURATION_ID)]:[]),
      ]);
      const {error}=await db.from('billing_customers').select('user_id').limit(1);
      if(error)throw Error('Billing database connection failed');
    },
    async checkout(actor,interval,surface='hosted'){
      if(!['hosted','embedded'].includes(surface))throw new MembershipError(400,'invalid_checkout','Invalid checkout option');
      if(surface==='embedded'&&!embeddedEnabled)throw new MembershipError(503,'embedded_unavailable','On-page checkout is temporarily unavailable. Use secure checkout instead.');
      requireEnabled();if(!Object.hasOwn(prices,interval))throw new MembershipError(400,'invalid_plan','Choose monthly or annual');
      return serialize(actor.id,async()=>{
      const customerId=await customer(actor,true);
      const subscriptions=await stripe.subscriptions.list({customer:customerId,status:'all',limit:100});
      if(subscriptions.data.some(s=>['active','trialing','past_due','unpaid','incomplete','paused'].includes(s.status)))throw new MembershipError(409,'subscription_exists','Manage your existing subscription instead');
      const open=await stripe.checkout.sessions.list({customer:customerId,status:'open',limit:100,expand:['data.line_items']});
      const embedded=surface==='embedded';
      const matching=open.data.find(s=>(embedded?['embedded','embedded_page'].includes(s.ui_mode):!s.ui_mode||['hosted','hosted_page'].includes(s.ui_mode))&&s.line_items?.data?.length===1&&id(s.line_items.data[0].price)===prices[interval]&&s.line_items.data[0].quantity===1);
      // Keep one resumable session for this customer's selected plan and surface.
      for(const session of open.data)if(session.id!==matching?.id)await stripe.checkout.sessions.expire(session.id);
      const output=session=>embedded?{clientSecret:session.client_secret}:{url:session.url};
      if(matching)return output(matching);
      const session=await stripe.checkout.sessions.create({mode:'subscription',customer:customerId,line_items:[{price:prices[interval],quantity:1}],client_reference_id:actor.id,subscription_data:{metadata:{streamunify_user_id:actor.id}},...(embedded?{ui_mode:'embedded_page',redirect_on_completion:'if_required',return_url:origin+'/?billing=return'}:{success_url:origin+'/?billing=success',cancel_url:origin+'/?billing=cancelled'}),integration_identifier:integration},{idempotencyKey:'streamunify-checkout-'+actor.id+'-'+interval+'-'+surface+'-'+randomUUID()});
      return output(session);
      });
    },
    async portal(actor){requireEnabled();return {url:(await stripe.billingPortal.sessions.create({customer:await customer(actor),return_url:origin+'/',...(env.STRIPE_PORTAL_CONFIGURATION_ID?{configuration:env.STRIPE_PORTAL_CONFIGURATION_ID}:{})})).url};},
    async webhook(raw,signature){
      requireEnabled();let event;
      try{event=stripe.webhooks.constructEvent(raw,signature,env.STRIPE_WEBHOOK_SECRET);}catch{throw new MembershipError(400,'invalid_signature','Invalid webhook signature');}
      if(event.livemode!==(mode==='live'))throw new MembershipError(400,'wrong_mode','Wrong payment environment');
      const obj=event.data.object;let subId;
      if(event.type.startsWith('customer.subscription.'))subId=obj.id;
      else if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))subId=id(obj.subscription);
      else if(['invoice.paid','invoice.payment_failed'].includes(event.type))subId=id(obj.parent?.subscription_details?.subscription||obj.subscription);
      if(!subId)return;
      const sub=await stripe.subscriptions.retrieve(subId,{expand:['latest_invoice']});
      const userId=sub.metadata?.streamunify_user_id;if(!userId)return;
      const allowed=sub.items.data.filter(item=>Object.values(prices).includes(id(item.price)));
      const paid=sub.status==='active'&&sub.latest_invoice?.status==='paid'&&allowed.length===sub.items.data.length&&allowed.length>0;
      const expiry=paid?Math.max(...allowed.map(i=>i.current_period_end||0))*1000:0;
      const {error}=await db.rpc('apply_billing_event',{p_event_id:event.id,p_created:event.created,p_user_id:userId,p_customer_id:id(sub.customer),p_subscription_id:sub.id,p_until:new Date(expiry).toISOString()});
      if(error)throw Error('Subscription update failed');
    }
  };
}

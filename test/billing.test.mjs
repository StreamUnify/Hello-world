import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBilling} from '../billing.mjs';
const env={BILLING_ENABLED:'true',STRIPE_API_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',SUPABASE_SECRET_KEY:'fixture',STRIPE_MONTHLY_PRICE_ID:'price_month',STRIPE_ANNUAL_PRICE_ID:'price_year'};
const actor={id:'user',email:'test@example.invalid'};
function fixture({event,subscription,existing=[],open=[],settings={}}={}){
  const calls=[];
  const db={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{customer_id:'cus_owned'}};}};},async rpc(name,args){calls.push({name,args});return {};}};
  const stripe={customers:{},subscriptions:{async list(){return {data:existing};},async retrieve(){return subscription;}},checkout:{sessions:{async expire(id){calls.push({expired:id});return {};},async list(){return {data:open};},async create(params,opts){calls.push({params,opts});return {url:'https://checkout.stripe.com/fixture',client_secret:'cs_fixture_secret_fixture'};}}},webhooks:{constructEvent(){if(!event)throw Error('invalid');return event;}}};
  return {billing:createBilling({env:{...env,...settings},stripeClient:stripe,dbClient:db}),calls};
}
test('billing requires complete configuration and matching API key mode',()=>{
  assert.equal(createBilling({env:{}}).enabled,false);
  assert.throws(()=>createBilling({env:{BILLING_ENABLED:'true'}}));
  assert.throws(()=>createBilling({env:{...env,STRIPE_API_KEY:'rk_live_fixture'}}));
});
test('connection checks reject invalid Stripe access and denied database access',async()=>{
  const list=async()=>({data:[]});
  const stripe={customers:{list},subscriptions:{list},checkout:{sessions:{list}},invoices:{list}};
  const db={from:()=>({select:()=>({limit:async()=>({error:null})})})};
  await createBilling({env,stripeClient:stripe,dbClient:db}).verifyConnections();
  await assert.rejects(createBilling({env,stripeClient:{...stripe,customers:{list:async()=>{throw Error('Denied');}}},dbClient:db}).verifyConnections());
  await assert.rejects(createBilling({env,stripeClient:stripe,dbClient:{from:()=>({select:()=>({limit:async()=>({error:{message:'denied'}})})})}}).verifyConnections(),/database connection failed/);
});
test('checkout accepts only the server monthly/annual prices and ignores client amounts',async()=>{
  const {billing,calls}=fixture();
  await assert.rejects(billing.checkout(actor,'price_attacker'),e=>e.status===400);
  await billing.checkout(actor,'annual');
  assert.deepEqual(calls[0].params.line_items,[{price:'price_year',quantity:1}]);
  assert.equal(calls[0].params.subscription_data.metadata.streamunify_user_id,'user');
  assert.equal(calls[0].params.payment_method_types,undefined);
  assert.ok(calls[0].opts.idempotencyKey);
});
test('existing subscriptions block duplicate checkout, pending sessions are reused',async()=>{
  await assert.rejects(fixture({existing:[{status:'active'}]}).billing.checkout(actor,'monthly'),e=>e.status===409);
  assert.deepEqual(await fixture({open:[{id:'cs_existing',url:'https://checkout.stripe.com/existing',line_items:{data:[{price:'price_month',quantity:1}]}}]}).billing.checkout(actor,'monthly'),{url:'https://checkout.stripe.com/existing'});
});
test('bad signatures and wrong environments cannot update membership',async()=>{
  await assert.rejects(fixture().billing.webhook(Buffer.from('{}'),'bad'),e=>e.code==='invalid_signature');
  await assert.rejects(fixture({event:{livemode:true}}).billing.webhook(Buffer.from('{}'),'signature'),e=>e.code==='wrong_mode');
});
test('webhook fetches current paid subscription before granting entitlement',async()=>{
  const {billing,calls}=fixture({event:{id:'evt_paid',created:5,livemode:false,type:'invoice.paid',data:{object:{parent:{subscription_details:{subscription:'sub_1'}}}}},subscription:{id:'sub_1',customer:'cus_owned',metadata:{streamunify_user_id:'user'},status:'active',latest_invoice:{status:'paid'},items:{data:[{price:{id:'price_month'},current_period_end:2000000000}]}}});
  await billing.webhook(Buffer.from('{}'),'signature');
  assert.equal(calls[0].name,'apply_billing_event');assert.equal(calls[0].args.p_until,new Date(2000000000000).toISOString());
});
test('unpaid and unsupported-price subscriptions do not grant premium',async()=>{
  for(const [status,price] of [['past_due','price_month'],['active','other']]){
    const {billing,calls}=fixture({event:{id:'evt',created:5,livemode:false,type:'customer.subscription.updated',data:{object:{id:'sub'}}},subscription:{id:'sub',customer:'cus_owned',metadata:{streamunify_user_id:'user'},status,latest_invoice:{status:'paid'},items:{data:[{price:{id:price},current_period_end:2000000000}]}}});
    await billing.webhook(Buffer.from('{}'),'signature');assert.equal(calls[0].args.p_until,'1970-01-01T00:00:00.000Z');
  }
});

test('embedded checkout requires explicit activation and a matching publishable key',async()=>{
 assert.equal(fixture().billing.publicConfig().embeddedEnabled,false);
 await assert.rejects(fixture().billing.checkout(actor,'monthly','embedded'),e=>e.code==='embedded_unavailable');
 const {billing,calls}=fixture({settings:{STRIPE_EMBEDDED_ENABLED:'true',STRIPE_PUBLISHABLE_KEY:'pk_test_fixture'}});
 assert.deepEqual(await billing.checkout(actor,'annual','embedded'),{clientSecret:'cs_fixture_secret_fixture'});
 assert.equal(calls[0].params.ui_mode,'embedded_page');assert.equal(calls[0].params.success_url,undefined);assert.equal(calls[0].params.cancel_url,undefined);
 assert.equal(calls[0].params.return_url,'https://streamunify.com/?billing=return');assert.equal(calls[0].params.payment_method_types,undefined);
 assert.deepEqual(billing.publicConfig(),{embeddedEnabled:true,publishableKey:'pk_test_fixture'});
 assert.equal(fixture({settings:{STRIPE_EMBEDDED_ENABLED:'true',STRIPE_PUBLISHABLE_KEY:'pk_live_wrong'}}).billing.publicConfig().embeddedEnabled,false);
});
test('changing plans expires an incompatible session and uses the selected server price',async()=>{
 const {billing,calls}=fixture({open:[{id:'cs_old',url:'https://checkout.stripe.com/old',line_items:{data:[{price:'price_month',quantity:1}]}}]});
 await billing.checkout(actor,'annual');assert.equal(calls[0].expired,'cs_old');assert.equal(calls[1].params.line_items[0].price,'price_year');
});
test('embedded sessions resume only for the matching plan and surface',async()=>{
 const {billing,calls}=fixture({settings:{STRIPE_EMBEDDED_ENABLED:'true',STRIPE_PUBLISHABLE_KEY:'pk_test_fixture'},open:[{id:'cs_embedded',ui_mode:'embedded_page',client_secret:'cs_owned_secret',line_items:{data:[{price:'price_year',quantity:1}]}}]});
 assert.deepEqual(await billing.checkout(actor,'annual','embedded'),{clientSecret:'cs_owned_secret'});assert.equal(calls.length,0);
});

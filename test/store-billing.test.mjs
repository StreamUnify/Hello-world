import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoreBilling} from '../store-billing.mjs';
import {appleEntitlement,googleEntitlement} from '../store-policy.mjs';
const actor={id:'11111111-1111-4111-8111-111111111111'};
const apple={appAccountToken:actor.id,bundleId:'com.streamunify.app',environment:'Production',productId:'com.streamunify.premium.monthly',type:'Auto-Renewable Subscription',originalTransactionId:'123',expiresDate:2000000000000};
const google={externalAccountIdentifiers:{obfuscatedExternalAccountId:actor.id},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',lineItems:[{productId:'streamunify_premium',expiryTime:new Date(2000000000000).toISOString(),offerDetails:{basePlanId:'monthly'}}]};
test('Apple grants only verified matching account/app/product/environment and handles refunds/grace',()=>{
  assert.equal(appleEntitlement(apple,null,1,actor.id,'Production').until,apple.expiresDate);
  for(const change of [{appAccountToken:'other'},{bundleId:'other'},{environment:'Sandbox'},{productId:'other'},{type:'Consumable'}])assert.throws(()=>appleEntitlement({...apple,...change},null,1,actor.id,'Production'));
  assert.equal(appleEntitlement({...apple,revocationDate:1},null,1,actor.id,'Production').until,0);
  assert.equal(appleEntitlement(apple,{gracePeriodExpiresDate:2100000000000},4,actor.id,'Production').until,2100000000000);
  assert.equal(appleEntitlement(apple,null,3,actor.id,'Production').until,0);
});
test('Google rejects cross-account/test/unknown-plan purchases and grants canceled access only through expiry',()=>{
  assert.equal(googleEntitlement(google,actor.id,'Production').until,2000000000000);
  assert.throws(()=>googleEntitlement(google,'other','Production'));
  assert.throws(()=>googleEntitlement({...google,testPurchase:{}},actor.id,'Production'));
  assert.throws(()=>googleEntitlement({...google,lineItems:[{...google.lineItems[0],offerDetails:{basePlanId:'unapproved'}}]},actor.id,'Production'));
  assert.equal(googleEntitlement({...google,subscriptionState:'SUBSCRIPTION_STATE_CANCELED'},actor.id,'Production').until,2000000000000);
  for(const state of ['SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_EXPIRED'])assert.equal(googleEntitlement({...google,subscriptionState:state},actor.id,'Production').until,0);
});
test('Apple verification queries current store state and never trusts client expiry',async()=>{
  const calls=[];
  const stores=createStoreBilling({env:{APPLE_BILLING_ENABLED:'true'},dbClient:{async rpc(name,args){calls.push({name,args});return {};}},appleClient:{async getAllSubscriptionStatuses(id){assert.equal(id,'123');return {data:[{lastTransactions:[{status:1,signedTransactionInfo:'verified'}]}]};}},appleVerifier:{async verifyAndDecodeTransaction(jws){assert.equal(jws,'verified');return apple;}}});
  await stores.verify(actor,{source:'apple',transactionId:'123',expiresDate:9999999999999});
  assert.equal(calls[0].args.p_until,new Date(apple.expiresDate).toISOString());
  assert.equal(calls[0].args.p_user_id,actor.id);
  await assert.rejects(stores.verify({id:'other'},{source:'apple',transactionId:'123'}));assert.equal(calls.length,1);
});
test('unverified Apple signatures cannot write any entitlement',async()=>{
  let writes=0;
  const stores=createStoreBilling({env:{APPLE_BILLING_ENABLED:'true'},dbClient:{async rpc(){writes++;}},appleClient:{async getAllSubscriptionStatuses(){return {data:[{lastTransactions:[{status:1,signedTransactionInfo:'forged'}]}]};}},appleVerifier:{async verifyAndDecodeTransaction(){throw Error('Invalid signature');}}});
  await assert.rejects(stores.verify(actor,{source:'apple',transactionId:'123'}));assert.equal(writes,0);
});
test('Google saves entitlement before acknowledgement and does not acknowledge failed fulfillment',async()=>{
  for(const fails of [false,true]){
    const calls=[];
    const stores=createStoreBilling({env:{GOOGLE_BILLING_ENABLED:'true'},dbClient:{async rpc(_name,args){calls.push('save');assert.equal(args.p_user_id,actor.id);assert.notEqual(args.p_reference,'purchase-token');return {error:fails?{}:null};}},googleClient:{async request(request){if(request.method==='GET'){calls.push('verify');return {data:google};}calls.push('acknowledge');return {};}}});
    if(fails)await assert.rejects(stores.verify(actor,{source:'google',purchaseToken:'purchase-token'}));else await stores.verify(actor,{source:'google',purchaseToken:'purchase-token'});
    assert.deepEqual(calls,fails?['verify','save']:['verify','save','acknowledge']);
  }
});
test('Google notification rejects wrong OIDC sender before reading purchase data',async()=>{
  let reads=0;
  const stores=createStoreBilling({env:{GOOGLE_BILLING_ENABLED:'true',GOOGLE_RTDN_AUDIENCE:'https://www.streamunify.com/api/stores/google/notifications',GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL:'expected@example.invalid'},dbClient:{from(){reads++;}},googleClient:{},googleOidc:{async verifyIdToken(){return {getPayload:()=>({email:'attacker@example.invalid',email_verified:true})};}}});
  await assert.rejects(stores.googleNotification({message:{data:'e30='}},'Bearer fixture'),e=>e.status===403);assert.equal(reads,0);
});
test('disabled stores never query providers or grant purchases',async()=>{
  const stores=createStoreBilling({env:{}});assert.equal(stores.publicConfig().apple,false);assert.equal(stores.publicConfig().google,false);
  await assert.rejects(stores.verify(actor,{source:'apple',transactionId:'123'}),e=>e.status===503);
  await assert.rejects(stores.verify(actor,{source:'google',purchaseToken:'purchase-token'}),e=>e.status===503);
});

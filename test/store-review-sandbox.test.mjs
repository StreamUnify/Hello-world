import test from 'node:test';
import assert from 'node:assert/strict';
import {APIException,APIError} from '@apple/app-store-server-library';
import {createStoreBilling} from '../store-billing.mjs';

const actor={id:'11111111-1111-4111-8111-111111111111'};
const transaction={appAccountToken:actor.id,bundleId:'com.streamunify.app',environment:'Sandbox',productId:'com.streamunify.premium.monthly',type:'Auto-Renewable Subscription',originalTransactionId:'123',expiresDate:2000000000000};
const response={data:[{lastTransactions:[{status:1,signedTransactionInfo:'signed-sandbox'}]}]};
const missing=()=>new APIException(404,APIError.TRANSACTION_ID_NOT_FOUND);
function fixture({approved=true,review=true,productionError=missing(),sandboxTransaction=transaction}={}){
  const calls=[];
  const options={
    env:{APPLE_BILLING_ENABLED:'true',STORE_REVIEW_ENABLED:String(review)},
    dbClient:{async rpc(name,args){calls.push({name,args});return {data:name==='store_review_access'?approved:null};}},
    appleClient:{async getAllSubscriptionStatuses(){calls.push({name:'production'});if(productionError)throw productionError;return response;}},
    appleVerifier:{async verifyAndDecodeTransaction(){return {...transaction,environment:'Production'};}},
    appleSandboxClient:{async getAllSubscriptionStatuses(){calls.push({name:'sandbox'});return response;}},
    appleSandboxVerifier:{async verifyAndDecodeTransaction(){return sandboxTransaction;}},
  };
  return {calls,options,stores:createStoreBilling(options)};
}
test('eligible reviewer uses verified sandbox only after genuine production transaction-not-found',async()=>{
  const f=fixture();await f.stores.verify(actor,{source:'apple',transactionId:'123',environment:'Production'});
  assert.deepEqual(f.calls.map(c=>c.name),['production','store_review_access','sandbox','apply_store_sandbox_subscription']);
  assert.equal(f.calls.at(-1).args.p_user_id,actor.id);
  assert.equal(f.calls.at(-1).args.p_reference,'123');
});
test('client sandbox claim cannot redirect a valid production purchase or weaken production persistence',async()=>{
  const f=fixture({productionError:null});await f.stores.verify(actor,{source:'apple',transactionId:'123',environment:'Sandbox',reviewer:true});
  assert.deepEqual(f.calls.map(c=>c.name),['production','apply_store_subscription']);
});
test('disabled or unapproved reviewers never query Apple sandbox or write entitlements',async()=>{
  for(const config of [{review:false},{approved:false}]){
    const f=fixture(config);await assert.rejects(f.stores.verify(actor,{source:'apple',transactionId:'123',environment:'Sandbox',reviewer:true}));
    assert.ok(!f.calls.some(c=>c.name==='sandbox'||c.name.startsWith('apply_')));
  }
});
test('Apple outages, fabricated missing errors, and signature failures cannot trigger fallback',async()=>{
  for(const error of [new APIException(500,5000000),Object.assign(new Error('fake'),{httpStatusCode:404,apiError:4040010}),new Error('signature failure')]){
    const f=fixture({productionError:error});await assert.rejects(f.stores.verify(actor,{source:'apple',transactionId:'123'}));
    assert.deepEqual(f.calls.map(c=>c.name),['production']);
  }
});
test('sandbox signature/account/environment mismatches never write even for eligible reviewers',async()=>{
  for(const changed of [{appAccountToken:'other'},{environment:'Production'},{bundleId:'wrong.app'}]){
    const f=fixture({sandboxTransaction:{...transaction,...changed}});
    await assert.rejects(f.stores.verify(actor,{source:'apple',transactionId:'123'}));
    assert.ok(!f.calls.some(c=>c.name.startsWith('apply_')));
  }
});
test('review database failures fail closed before querying sandbox',async()=>{
  const f=fixture();f.options.dbClient.rpc=async()=>({error:{message:'unavailable'}});
  await assert.rejects(f.stores.verify(actor,{source:'apple',transactionId:'123'}),e=>e.code==='store_review_unavailable');
  assert.deepEqual(f.calls.map(c=>c.name),['production']);
});
test('Google verified test purchase requires reviewer eligibility and uses only sandbox persistence',async()=>{
  for(const approved of [false,true]){
    const calls=[];
    const stores=createStoreBilling({env:{GOOGLE_BILLING_ENABLED:'true',STORE_REVIEW_ENABLED:'true'},
      dbClient:{async rpc(name,args){calls.push(name);return {data:name==='store_review_access'?approved:null};}},
      googleClient:{async request(r){if(r.method==='POST'){calls.push('acknowledge');return {};}return {data:{testPurchase:{},externalAccountIdentifiers:{obfuscatedExternalAccountId:actor.id},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',lineItems:[{productId:'streamunify_premium',expiryTime:new Date(transaction.expiresDate).toISOString(),offerDetails:{basePlanId:'monthly'}}]}};}}
    });
    if(approved){await stores.verify(actor,{source:'google',purchaseToken:'test-purchase-token',environment:'Production'});assert.deepEqual(calls,['store_review_access','apply_store_sandbox_subscription','acknowledge']);}
    else {await assert.rejects(stores.verify(actor,{source:'google',purchaseToken:'test-purchase-token',reviewer:true}),e=>e.code==='sandbox_not_allowed');assert.deepEqual(calls,['store_review_access']);}
  }
});
test('sandbox-only server mode requires explicit review enablement',()=>{
  assert.throws(()=>createStoreBilling({env:{GOOGLE_BILLING_ENABLED:'true',STORE_ENVIRONMENT:'Sandbox'},googleClient:{},dbClient:{}}),/review enablement/);
});
test('forged Apple sandbox notifications fail before database lookup',async()=>{
  const f=fixture();f.options.appleVerifier.verifyAndDecodeNotification=async()=>{throw Error('invalid production signature');};
  f.options.appleSandboxVerifier.verifyAndDecodeNotification=async()=>{throw Error('invalid sandbox signature');};
  await assert.rejects(f.stores.appleNotification({signedPayload:'forged'}));assert.deepEqual(f.calls,[]);
});

import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {AppStoreServerAPIClient,Environment,SignedDataVerifier,APIException,APIError} from '@apple/app-store-server-library';
import {GoogleAuth,OAuth2Client} from 'google-auth-library';
import {MembershipError} from './membership-policy.mjs';
import {STORE_PRODUCTS,GOOGLE_PLANS,appleEntitlement,googleEntitlement} from './store-policy.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function createStoreBilling({env=process.env,dbClient,appleClient,appleVerifier,appleSandboxClient,appleSandboxVerifier,googleClient,googleOidc}={}){
  const apple=env.APPLE_BILLING_ENABLED==='true',google=env.GOOGLE_BILLING_ENABLED==='true';
  const environment=env.STORE_ENVIRONMENT||'Production';
  const reviewEnabled=env.STORE_REVIEW_ENABLED==='true';
  if(!['Production','Sandbox'].includes(environment))throw Error('Invalid store environment');
  if((apple||google)&&environment==='Sandbox'&&!reviewEnabled)throw Error('Sandbox billing requires explicit review enablement');
  const db=dbClient||((apple||google)?createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}):null);
  const appleEnv=environment==='Sandbox'?Environment.SANDBOX:Environment.PRODUCTION;
  let appleApi=appleClient,verifier=appleVerifier,play=googleClient;
  const oidc=googleOidc||new OAuth2Client();
  if(apple&&!appleClient){
    if(!env.APPLE_IAP_KEY_ID||!env.APPLE_IAP_ISSUER_ID||!env.APPLE_IAP_PRIVATE_KEY||!/^\d+$/.test(env.APPLE_APP_ID||''))throw Error('Apple billing configuration incomplete');
    appleApi=new AppStoreServerAPIClient(env.APPLE_IAP_PRIVATE_KEY.replace(/\\n/g,'\n'),env.APPLE_IAP_KEY_ID,env.APPLE_IAP_ISSUER_ID,'com.streamunify.app',appleEnv);
    verifier=new SignedDataVerifier([readFileSync(new URL('./certs/AppleRootCA-G3.pem',import.meta.url))],true,appleEnv,'com.streamunify.app',Number(env.APPLE_APP_ID));
  }
  if(google&&!googleClient){
    if(!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON||!env.GOOGLE_RTDN_AUDIENCE||!env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL)throw Error('Google billing configuration incomplete');
    play=new GoogleAuth({credentials:JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON),scopes:['https://www.googleapis.com/auth/androidpublisher']});
  }
  if(apple&&reviewEnabled&&environment==='Production'){
    appleSandboxClient ||= new AppStoreServerAPIClient(env.APPLE_IAP_PRIVATE_KEY?.replace(/\\n/g,'\n'),env.APPLE_IAP_KEY_ID,env.APPLE_IAP_ISSUER_ID,'com.streamunify.app',Environment.SANDBOX);
    appleSandboxVerifier ||= new SignedDataVerifier([readFileSync(new URL('./certs/AppleRootCA-G3.pem',import.meta.url))],true,Environment.SANDBOX,'com.streamunify.app',Number(env.APPLE_APP_ID));
  }
  const enabled=source=>source==='apple'?apple:source==='google'?google:false;
  function requireStore(source){if(!enabled(source))throw new MembershipError(503,'store_unavailable','Store purchases are not available yet');}
  const tableFor=verifiedEnvironment=>verifiedEnvironment==='Sandbox'?'store_sandbox_subscriptions':'store_subscriptions';
  async function reviewAllowed(actorId){
    if(!reviewEnabled)return false;
    const {data,error}=await db.rpc('store_review_access',{p_user_id:actorId});
    if(error)throw new MembershipError(503,'store_review_unavailable','Store review access could not be checked');
    return data===true;
  }
  async function requireReview(actorId){if(!await reviewAllowed(actorId))throw new MembershipError(403,'sandbox_not_allowed','Test purchases are restricted to approved review accounts');}
  async function save(source,actorId,reference,result,checkedAt,verificationReference,previousReference=null,verifiedEnvironment='Production'){
    if(!reference||reference.length>512)throw Error('Invalid purchase reference');
    const {error}=await db.rpc(verifiedEnvironment==='Sandbox'?'apply_store_sandbox_subscription':'apply_store_subscription',{p_source:source,p_reference:reference,p_user_id:actorId,p_product_id:result.productId,p_until:new Date(result.until).toISOString(),p_checked_at:checkedAt,p_verification_reference:verificationReference,p_previous_reference:previousReference});
    if(error)throw new MembershipError(503,'store_sync_failed','Purchase verification could not be saved. Use Restore purchases to retry.');
  }
  async function verifyApple(actorId,transactionId,expectedEnvironment=null){
    requireStore('apple');if(!/^\d{1,40}$/.test(transactionId||''))throw new MembershipError(400,'invalid_purchase','Invalid Apple transaction');
    const checkedAt=new Date().toISOString();
    let verifiedEnvironment=expectedEnvironment||environment;
    let api=verifiedEnvironment==='Sandbox'&&environment==='Production'?appleSandboxClient:appleApi;
    let signedVerifier=verifiedEnvironment==='Sandbox'&&environment==='Production'?appleSandboxVerifier:verifier;
    if(verifiedEnvironment==='Sandbox')await requireReview(actorId);
    let response;
    try{response=await api.getAllSubscriptionStatuses(transactionId);}catch(error){
      // Only a store-confirmed missing production transaction can use the review
      // path. Outages, signature failures and client environment claims cannot.
      const notFound=error instanceof APIException&&error.httpStatusCode===404&&[APIError.TRANSACTION_ID_NOT_FOUND,APIError.ORIGINAL_TRANSACTION_ID_NOT_FOUND].includes(error.apiError);
      if(expectedEnvironment||environment!=='Production'||!notFound||!await reviewAllowed(actorId))throw error;
      verifiedEnvironment='Sandbox';api=appleSandboxClient;signedVerifier=appleSandboxVerifier;
      response=await api.getAllSubscriptionStatuses(transactionId);
    }
    const entries=(response.data||[]).flatMap(g=>g.lastTransactions||[]);let found=false;
    for(const entry of entries){
      const transaction=await signedVerifier.verifyAndDecodeTransaction(entry.signedTransactionInfo);
      if(transaction.appAccountToken?.toLowerCase()!==actorId.toLowerCase()||!Object.values(STORE_PRODUCTS.apple).includes(transaction.productId))continue;
      const renewal=entry.signedRenewalInfo?await signedVerifier.verifyAndDecodeRenewalInfo(entry.signedRenewalInfo):null;
      const result=appleEntitlement(transaction,renewal,entry.status,actorId,verifiedEnvironment);
      await save('apple',actorId,result.reference,result,checkedAt,result.reference,null,verifiedEnvironment);found=true;
    }
    if(!found)throw new MembershipError(403,'invalid_purchase','No subscription for this StreamUnify account was found');
  }
  async function verifyGoogle(actorId,token,expectedEnvironment=null){
    requireStore('google');if(typeof token!=='string'||token.length<10||token.length>4096)throw new MembershipError(400,'invalid_purchase','Invalid Google purchase token');
    const checkedAt=new Date().toISOString();
    const url='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.streamunify.app/purchases/subscriptionsv2/tokens/'+encodeURIComponent(token);
    const {data}=await play.request({url,method:'GET',timeout:10000});
    const verifiedEnvironment=data.testPurchase?'Sandbox':'Production';
    if((expectedEnvironment&&expectedEnvironment!==verifiedEnvironment)||(environment==='Sandbox'&&verifiedEnvironment!=='Sandbox'))throw new MembershipError(403,'invalid_purchase','Purchase environment does not match');
    if(verifiedEnvironment==='Sandbox')await requireReview(actorId);
    const result=googleEntitlement(data,actorId,verifiedEnvironment);
    await save('google',actorId,hash(token),result,checkedAt,token,data.linkedPurchaseToken?hash(data.linkedPurchaseToken):null,verifiedEnvironment);
    // Fulfill first, then acknowledge; a failed save must never finish a purchase.
    if(result.until>Date.now()&&data.acknowledgementState==='ACKNOWLEDGEMENT_STATE_PENDING')await play.request({url:'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.streamunify.app/purchases/subscriptions/'+encodeURIComponent(result.productId)+'/tokens/'+encodeURIComponent(token)+':acknowledge',method:'POST',data:{},timeout:10000});
  }
  return {
    publicConfig:()=>({apple,google,products:STORE_PRODUCTS,googlePlans:GOOGLE_PLANS}),
    async verify(actor,input){if(input?.source==='apple')await verifyApple(actor.id,input.transactionId);else if(input?.source==='google')await verifyGoogle(actor.id,input.purchaseToken);else throw new MembershipError(400,'invalid_store','Invalid store');},
    async appleNotification(input){
      requireStore('apple');if(typeof input?.signedPayload!=='string'||input.signedPayload.length>100000)throw new MembershipError(400,'invalid_notification','Invalid store notification');
      let notice,signedVerifier=verifier,verifiedEnvironment=environment;
      try{notice=await signedVerifier.verifyAndDecodeNotification(input.signedPayload);}catch(error){
        if(!reviewEnabled||environment!=='Production')throw error;
        signedVerifier=appleSandboxVerifier;verifiedEnvironment='Sandbox';
        notice=await signedVerifier.verifyAndDecodeNotification(input.signedPayload);
      }
      if(!notice.data?.signedTransactionInfo)return;
      const t=await signedVerifier.verifyAndDecodeTransaction(notice.data.signedTransactionInfo);
      if(t.environment!==verifiedEnvironment)throw new MembershipError(403,'invalid_notification','Purchase environment does not match');
      const {data,error}=await db.from(tableFor(verifiedEnvironment)).select('user_id').eq('source','apple').eq('external_reference',t.originalTransactionId).maybeSingle();
      if(error)throw Error('Store lookup failed');if(data)await verifyApple(data.user_id,t.originalTransactionId,verifiedEnvironment);
    },
    async googleNotification(input,authorization){
      requireStore('google');const match=/^Bearer (\S+)$/.exec(authorization||'');if(!match)throw new MembershipError(401,'invalid_notification','Notification authentication required');
      let claims;try{claims=(await oidc.verifyIdToken({idToken:match[1],audience:env.GOOGLE_RTDN_AUDIENCE})).getPayload();}catch{throw new MembershipError(401,'invalid_notification','Invalid notification identity');}
      if(claims?.email!==env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL||claims.email_verified!==true)throw new MembershipError(403,'invalid_notification','Invalid notification sender');
      let event;try{event=JSON.parse(Buffer.from(input.message.data,'base64').toString());}catch{throw new MembershipError(400,'invalid_notification','Invalid notification');}
      if(event.packageName!=='com.streamunify.app')throw new MembershipError(403,'invalid_notification','Wrong app');
      const token=event.subscriptionNotification?.purchaseToken;if(!token)return;
      for(const verifiedEnvironment of environment==='Sandbox'?['Sandbox']:reviewEnabled?['Production','Sandbox']:['Production']){
        const {data,error}=await db.from(tableFor(verifiedEnvironment)).select('user_id').eq('source','google').eq('external_reference',hash(token)).maybeSingle();
        if(error)throw Error('Store lookup failed');if(data)await verifyGoogle(data.user_id,token,verifiedEnvironment);
      }
    },
    async refreshActor(actor){
      if(!apple&&!google)return;
      const environments=environment==='Sandbox'?['Sandbox']:['Production'];
      if(reviewEnabled&&environment==='Production'&&await reviewAllowed(actor.id))environments.push('Sandbox');
      for(const verifiedEnvironment of environments){
        if(verifiedEnvironment==='Sandbox'&&!await reviewAllowed(actor.id))continue;
        const {data,error}=await db.from(tableFor(verifiedEnvironment)).select('source,verification_reference,checked_at').eq('user_id',actor.id);
        if(error)throw Error('Store lookup failed');
        for(const row of data||[])if(enabled(row.source)&&Date.now()-Date.parse(row.checked_at)>60000){try{if(row.source==='apple')await verifyApple(actor.id,row.verification_reference,verifiedEnvironment);else await verifyGoogle(actor.id,row.verification_reference,verifiedEnvironment);}catch{console.error('Store refresh unavailable; retaining last verified expiry');}}
      }
    }
  };
}

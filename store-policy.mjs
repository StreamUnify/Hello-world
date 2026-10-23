import {MembershipError} from './membership-policy.mjs';
export const STORE_PRODUCTS={apple:{monthly:'com.streamunify.premium.monthly',annual:'com.streamunify.premium.annual'},google:{monthly:'streamunify_premium',annual:'streamunify_premium'}};
export const GOOGLE_PLANS={monthly:'monthly',annual:'annual'};
const reject=()=>{throw new MembershipError(403,'invalid_purchase','This purchase could not be verified for your account');};
export function appleEntitlement(transaction,renewal,status,actorId,environment){
  if(transaction.appAccountToken?.toLowerCase()!==actorId.toLowerCase()||transaction.bundleId!=='com.streamunify.app'||transaction.environment!==environment||!Object.values(STORE_PRODUCTS.apple).includes(transaction.productId)||transaction.type!=='Auto-Renewable Subscription')reject();
  let until=0;
  if(!transaction.revocationDate&&[1,4].includes(status))until=status===4?Number(renewal?.gracePeriodExpiresDate||0):Number(transaction.expiresDate||0);
  if(!Number.isFinite(until))reject();
  return {reference:transaction.originalTransactionId,productId:transaction.productId,until};
}
export function googleEntitlement(purchase,actorId,environment){
  if(purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId!==actorId||Boolean(purchase.testPurchase)!==(environment==='Sandbox'))reject();
  const items=purchase.lineItems||[];
  if(!items.length||items.some(i=>i.productId!=='streamunify_premium'||!Object.values(GOOGLE_PLANS).includes(i.offerDetails?.basePlanId)))reject();
  const allowed=['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'].includes(purchase.subscriptionState);
  const until=allowed?Math.max(...items.map(i=>Date.parse(i.expiryTime))):0;
  if(!Number.isFinite(until))reject();
  return {productId:items[0].productId,until};
}

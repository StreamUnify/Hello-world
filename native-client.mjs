import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {SecureStorage,KeychainAccess} from '@aparajita/capacitor-secure-storage';
import {NativePurchases,PURCHASE_TYPE} from '@capgo/native-purchases';
export const isNative=()=>Capacitor.isNativePlatform();
export const nativePlatform=()=>Capacitor.getPlatform();
export const nativeRedirect='com.streamunify.app://auth/callback';
export function callbackAuth(value){
  try{
    const url=new URL(value);
    if(url.protocol!=='com.streamunify.app:'||url.hostname!=='auth'||url.pathname!=='/callback'||url.username||url.password)return null;
    const error=url.searchParams.get('error_description')||url.searchParams.get('error');
    if(error)return {error};
    const code=url.searchParams.get('code');
    if(code)return {code,flowId:url.searchParams.get('sb_flow_id')||undefined};
    const tokenHash=url.searchParams.get('token_hash'),type=url.searchParams.get('type');
    if(tokenHash&&['email','recovery'].includes(type))return {tokenHash,type};
    return null;
  }catch{return null;}
}
export const callbackCode=value=>callbackAuth(value)?.code||null;
export function createNativeSessionStorage(storage=SecureStorage){
  return {getItem:key=>storage.getItem('streamunify.auth.'+key),setItem:(key,value)=>storage.setItem('streamunify.auth.'+key,value),removeItem:key=>storage.removeItem('streamunify.auth.'+key)};
}
export async function prepareNativeStorage(){
  if(!isNative())return;
  await SecureStorage.setSynchronize(false);
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
}
export async function configureNativeAuth(client,onError){
  if(!isNative())return;
  const seen=new Set();
  const handle=async value=>{
    const auth=callbackAuth(value);if(!auth)return;
    if(auth.error){onError('This email link could not be verified. Request a new link and use the newest email.');return;}
    const key=auth.code?'code:'+auth.code:'token:'+auth.type+':'+auth.tokenHash;if(seen.has(key))return;seen.add(key);
    const result=auth.code
      ?await client.auth.exchangeCodeForSession(auth.code,auth.flowId?{flowId:auth.flowId}:undefined)
      :await client.auth.verifyOtp({token_hash:auth.tokenHash,type:auth.type});
    if(result.error)onError('This email link could not be verified. Open it on the device where you requested it, or request a new link.');
  };
  await App.addListener('appUrlOpen',({url})=>handle(url).catch(()=>onError('Email verification failed. Please request a new link.')));
  await App.addListener('appStateChange',({isActive})=>{if(isActive)client.auth.startAutoRefresh();else client.auth.stopAutoRefresh();});
  const launch=await App.getLaunchUrl();if(launch?.url)await handle(launch.url);
  client.auth.startAutoRefresh();
}
export async function nativeProducts(stores){
  const platform=nativePlatform()==='ios'?'apple':'google';
  if(!stores?.[platform])return {};
  const products=stores.products[platform];
  const response=await NativePurchases.getProducts({productIdentifiers:[...new Set(Object.values(products))],productType:PURCHASE_TYPE.SUBS});
  return Object.fromEntries(['monthly','annual'].map(interval=>[interval,response.products.find(p=>platform==='apple'?p.identifier===products[interval]:p.planIdentifier===products[interval]&&p.identifier===stores.googlePlans[interval]&&!p.offerId)]));
}
async function syncPurchase(transaction,api){
  const source=nativePlatform()==='ios'?'apple':'google';
  await api('/api/stores/verify',{method:'POST',body:JSON.stringify(source==='apple'?{source,transactionId:transaction.transactionId}:{source,purchaseToken:transaction.purchaseToken})});
  // Do not finish the transaction until the server has saved a verified result.
  const token=source==='apple'?transaction.transactionId:transaction.purchaseToken;
  if(source==='apple'&&token)await NativePurchases.acknowledgePurchase({purchaseToken:token});
}
export async function buyNative(interval,actor,stores,api){
  const source=nativePlatform()==='ios'?'apple':'google';
  if(!actor?.id||!stores?.[source])throw Error('Store purchases are not available yet');
  if((await api('/api/account')).plan==='premium')throw Error('Premium is already active on this account');
  const products=await nativeProducts(stores);if(!products[interval])throw Error('This subscription is not available in the store yet');
  const transaction=await NativePurchases.purchaseProduct({productIdentifier:stores.products[source][interval],...(source==='google'?{planIdentifier:stores.googlePlans[interval]}:{}),productType:PURCHASE_TYPE.SUBS,appAccountToken:actor.id,autoAcknowledgePurchases:false,isConsumable:false});
  await syncPurchase(transaction,api);
}
export async function restoreNative(actor,api){
  await NativePurchases.restorePurchases();
  const {purchases}=await NativePurchases.getPurchases({productType:PURCHASE_TYPE.SUBS,appAccountToken:actor.id});
  let count=0;for(const purchase of purchases){await syncPurchase(purchase,api);count++;}return count;
}
export async function listenNativePurchases(getActor,api,onChange,onError){
  if(!isNative())return;
  await NativePurchases.addListener('transactionUpdated',transaction=>{if(getActor())syncPurchase(transaction,api).then(onChange).catch(()=>onError('A store update needs verification. Use Restore purchases to retry.'));});
}
export const manageNative=()=>NativePurchases.manageSubscriptions();

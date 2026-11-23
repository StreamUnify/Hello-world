// Xbox keeps its existing app-isolated session. No iOS/Android billing plugins.
export const isNative=()=>true;
export const nativePlatform=()=> 'xbox';
export const nativeRedirect='https://www.streamunify.com/';
export const createNativeSessionStorage=()=>({
 getItem:key=>localStorage.getItem(key),
 setItem:(key,value)=>localStorage.setItem(key,value),
 removeItem:key=>localStorage.removeItem(key)
});
export const prepareNativeStorage=async()=>{};
export const configureNativeAuth=async()=>{};
export const nativeProducts=async()=>({});
export const listenNativePurchases=async()=>{};
const unavailable=async()=>{throw Error('Purchases are unavailable in this Xbox preview.');};
export const buyNative=unavailable,restoreNative=unavailable,manageNative=unavailable;

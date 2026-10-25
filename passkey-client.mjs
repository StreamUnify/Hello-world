import {Capacitor,registerPlugin} from '@capacitor/core';
const nativePasskeys=registerPlugin('StreamUnifyPasskeys');
const ensure=result=>{if(result.error)throw result.error;return result.data;};
export async function supportsPasskeys({native=Capacitor.isNativePlatform(),bridge=nativePasskeys}={}){
 try{if(native)return (await bridge.isAvailable()).available===true;return window.isSecureContext&&!!window.PublicKeyCredential&&!!navigator.credentials;}catch{return false;}
}
export async function registerAccountPasskey(client,{native=Capacitor.isNativePlatform(),bridge=nativePasskeys}={}){
 const {user}=ensure(await client.auth.getUser());
 if(!user?.email_confirmed_at)throw Error('Verify your email before creating a passkey.');
 if(!native)return ensure(await client.auth.registerPasskey());
 const options=ensure(await client.auth.passkey.startRegistration());
 const {credential}=await bridge.register({options:options.options});
 return ensure(await client.auth.passkey.verifyRegistration({challengeId:options.challenge_id,credential}));
}
export async function signInAccountPasskey(client,{native=Capacitor.isNativePlatform(),bridge=nativePasskeys}={}){
 if(!native)return ensure(await client.auth.signInWithPasskey());
 const options=ensure(await client.auth.passkey.startAuthentication());
 const {credential}=await bridge.authenticate({options:options.options});
 return ensure(await client.auth.passkey.verifyAuthentication({challengeId:options.challenge_id,credential}));
}
export function passkeyError(error){
 if(['NotAllowedError','AbortError'].includes(error?.name)||error?.code==='cancelled')return 'Passkey request canceled. You can still sign in with your email and password.';
 return 'Passkey setup or sign-in could not finish. Try again, or use your email and password.';
}

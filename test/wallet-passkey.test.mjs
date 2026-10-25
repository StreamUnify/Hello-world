import test from 'node:test';
import assert from 'node:assert/strict';
import {passkeyConfiguration} from '../passkey-config.mjs';
import {registerAccountPasskey,signInAccountPasskey,supportsPasskeys} from '../passkey-client.mjs';
import {mountCheckout} from '../checkout-client.mjs';
test('passkeys default off and native apps require valid signing identities',()=>{
 assert.deepEqual(passkeyConfiguration({}).publicConfig,{web:false,ios:false,android:false});
 assert.deepEqual(passkeyConfiguration({PASSKEYS_ENABLED:'true',PASSKEYS_IOS_ENABLED:'true',PASSKEYS_ANDROID_ENABLED:'true'}).publicConfig,{web:true,ios:false,android:false});
 const c=passkeyConfiguration({PASSKEYS_ENABLED:'true',PASSKEYS_IOS_ENABLED:'true',PASSKEYS_ANDROID_ENABLED:'true',APPLE_TEAM_ID:'A1B2C3D4E5',ANDROID_SIGNING_CERT_SHA256:Array(32).fill('AB').join(':')});
 assert.equal(c.publicConfig.ios,true);assert.equal(c.publicConfig.android,true);assert.equal(c.apple.webcredentials.apps[0],'A1B2C3D4E5.com.streamunify.app');
 assert.equal(c.android[0].target.package_name,'com.streamunify.app');assert.equal(passkeyConfiguration({ANDROID_SIGNING_CERT_SHA256:'garbage'}).android,null);
});
test('native registration verifies user first and sends challenge and credential to Supabase',async()=>{
 let bridgeCalls=0,verified;
 const bridge={async register({options}){bridgeCalls++;assert.equal(options.challenge,'fixture');return {credential:{id:'credential'}};}};
 const client={auth:{async getUser(){return {data:{user:{email_confirmed_at:'2026-10-25'}}};},passkey:{async startRegistration(){return {data:{challenge_id:'challenge',options:{challenge:'fixture'}}};},async verifyRegistration(value){verified=value;return {data:{id:'passkey'}};}}}};
 assert.equal((await registerAccountPasskey(client,{native:true,bridge})).id,'passkey');assert.deepEqual(verified,{challengeId:'challenge',credential:{id:'credential'}});
 client.auth.getUser=async()=>({data:{user:{}}});await assert.rejects(registerAccountPasskey(client,{native:true,bridge}),/Verify your email/);assert.equal(bridgeCalls,1);
});
test('native sign-in cannot create a session without Supabase verification',async()=>{
 const client={auth:{passkey:{async startAuthentication(){return {data:{challenge_id:'challenge',options:{challenge:'fixture'}}};},async verifyAuthentication(){return {error:Error('Invalid signature')};}}}};
 await assert.rejects(signInAccountPasskey(client,{native:true,bridge:{async authenticate(){return {credential:{id:'fixture'}};}}}),/Invalid signature/);
 assert.equal(await supportsPasskeys({native:true,bridge:{async isAvailable(){throw Error('Old app');}}}),false);
});
test('embedded checkout mounts Stripe and cleans up failed mounts without handling payment data',async()=>{
 let destroyed=0,received;const instance={mount(container){assert.equal(container,'mount');},destroy(){destroyed++;}};
 const load=async()=>key=>({async initEmbeddedCheckout(options){assert.equal(key,'pk_test_fixture');received=options;return instance;}});
 await assert.rejects(mountCheckout({publishableKey:'sk_test_never_client',clientSecret:'fixture',load}),/unavailable/);
 const onComplete=()=>{};assert.equal(await mountCheckout({publishableKey:'pk_test_fixture',clientSecret:'cs_owned_secret',container:'mount',onComplete,load}),instance);assert.equal(received.clientSecret,'cs_owned_secret');assert.equal(received.onComplete,onComplete);
 instance.mount=()=>{throw Error('Mount failed');};await assert.rejects(mountCheckout({publishableKey:'pk_test_fixture',clientSecret:'cs_owned_secret',load}),/Mount failed/);assert.equal(destroyed,1);
});

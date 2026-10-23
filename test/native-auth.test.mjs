import test from 'node:test';
import assert from 'node:assert/strict';
import {callbackCode,createNativeSessionStorage} from '../native-client.mjs';
test('native callback accepts only the exact registered auth destination',()=>{
  assert.equal(callbackCode('com.streamunify.app://auth/callback?code=fixture'),'fixture');
  for(const url of ['https://attacker.invalid/auth/callback?code=fixture','com.streamunify.app://attacker/callback?code=fixture','com.streamunify.app://auth/other?code=fixture','com.streamunify.app://user@auth/callback?code=fixture'])assert.equal(callbackCode(url),null);
});
test('native session adapter persists through secure storage without a localStorage fallback',async()=>{
  const values=new Map();const storage=createNativeSessionStorage({async getItem(k){return values.get(k)||null;},async setItem(k,v){values.set(k,v);},async removeItem(k){values.delete(k);}});
  await storage.setItem('session','token');assert.equal(values.get('streamunify.auth.session'),'token');assert.equal(await storage.getItem('session'),'token');await storage.removeItem('session');assert.equal(await storage.getItem('session'),null);
  await assert.rejects(createNativeSessionStorage({async getItem(){throw Error('Locked');}}).getItem('session'));
});

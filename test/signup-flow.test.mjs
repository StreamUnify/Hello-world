import test from 'node:test';
import assert from 'node:assert/strict';
import {sendSignupEmail,saveVerifiedPassword,needsPasswordSetup,readPendingSignup,savePendingSignup,signupErrorMessage} from '../signup-flow.mjs';
test('pending email survives refresh, expires after one day, and tolerates blocked storage',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 savePendingSignup(storage,{email:'test@example.com',sentAt:1000});
 assert.deepEqual(readPendingSignup(storage,2000),{email:'test@example.com',sentAt:1000});
 assert.equal(readPendingSignup(storage,86402000),null);
 assert.equal(readPendingSignup(storage,0),null);
 savePendingSignup(storage,null);assert.equal(readPendingSignup(storage),null);
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 assert.equal(readPendingSignup(blocked),null);assert.doesNotThrow(()=>savePendingSignup(blocked,{email:'test@example.com',sentAt:1}));
});
test('email delivery and rate-limit failures give actionable messages',()=>{
 assert.match(signupErrorMessage({code:'email_address_not_authorized'}),/couldn’t send/);
 assert.match(signupErrorMessage({status:429}),/wait/);
 assert.match(signupErrorMessage({code:'over_email_send_rate_limit'}),/latest email/);
 assert.equal(signupErrorMessage(Error('Network unavailable')),'Network unavailable');
});
test('email-first signup sends no password and preserves confirmation destination',async()=>{
 let request;await sendSignupEmail({auth:{async signInWithOtp(value){request=value;return {error:null};}}},'test@example.com','https://www.streamunify.com/');
 assert.equal(request.email,'test@example.com');assert.equal('password' in request,false);assert.equal(request.options.emailRedirectTo,'https://www.streamunify.com/');assert.equal(request.options.shouldCreateUser,true);
 await assert.rejects(sendSignupEmail({auth:{async signInWithOtp(){return {error:Error('Rate limited')};}}},'test@example.com','https://www.streamunify.com/'),/Rate limited/);
});
test('password creation rejects mismatches, weak passwords, and unverified sessions without updating Auth',async()=>{
 let updates=0;const client={auth:{async getUser(){return {data:{user:{id:'fixture'}}};},async updateUser(){updates++;}}};
 await assert.rejects(saveVerifiedPassword(client,'ten-chars!','different!'),/don’t match/);
 await assert.rejects(saveVerifiedPassword(client,'short','short'),/10 characters/);
 await assert.rejects(saveVerifiedPassword(client,'ten-chars!','ten-chars!'),/Verify your email/);assert.equal(updates,0);
});
test('password creation verifies the user with Auth and clears only the presentation flag',async()=>{
 let saved;const user={id:'fixture',email_confirmed_at:'2026-10-25',user_metadata:{signup_password_pending:true}};
 const client={auth:{async getUser(){return {data:{user},error:null};},async updateUser(value){saved=value;return {data:{user:{...user,user_metadata:{signup_password_pending:false}}},error:null};}}};
 assert.equal(needsPasswordSetup(user),true);assert.equal(needsPasswordSetup({...user,email_confirmed_at:null}),false);
 const result=await saveVerifiedPassword(client,'ten-chars!','ten-chars!');assert.equal(saved.password,'long-password-123');assert.equal(saved.data.signup_password_pending,false);assert.equal(needsPasswordSetup(result),false);
});

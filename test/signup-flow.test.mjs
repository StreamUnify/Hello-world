import test from 'node:test';
import assert from 'node:assert/strict';
import {sendSignupEmail,saveVerifiedPassword,needsPasswordSetup} from '../signup-flow.mjs';
test('email-first signup sends no password and preserves confirmation destination',async()=>{
 let request;await sendSignupEmail({auth:{async signInWithOtp(value){request=value;return {error:null};}}},'test@example.com','https://www.streamunify.com/');
 assert.equal(request.email,'test@example.com');assert.equal('password' in request,false);assert.equal(request.options.emailRedirectTo,'https://www.streamunify.com/');assert.equal(request.options.shouldCreateUser,true);
 await assert.rejects(sendSignupEmail({auth:{async signInWithOtp(){return {error:Error('Rate limited')};}}},'test@example.com','https://www.streamunify.com/'),/Rate limited/);
});
test('password creation rejects mismatches, weak passwords, and unverified sessions without updating Auth',async()=>{
 let updates=0;const client={auth:{async getUser(){return {data:{user:{id:'fixture'}}};},async updateUser(){updates++;}}};
 await assert.rejects(saveVerifiedPassword(client,'long-password-123','different-password'),/don’t match/);
 await assert.rejects(saveVerifiedPassword(client,'short','short'),/12 characters/);
 await assert.rejects(saveVerifiedPassword(client,'long-password-123','long-password-123'),/Verify your email/);assert.equal(updates,0);
});
test('password creation verifies the user with Auth and clears only the presentation flag',async()=>{
 let saved;const user={id:'fixture',email_confirmed_at:'2026-10-25',user_metadata:{signup_password_pending:true}};
 const client={auth:{async getUser(){return {data:{user},error:null};},async updateUser(value){saved=value;return {data:{user:{...user,user_metadata:{signup_password_pending:false}}},error:null};}}};
 assert.equal(needsPasswordSetup(user),true);assert.equal(needsPasswordSetup({...user,email_confirmed_at:null}),false);
 const result=await saveVerifiedPassword(client,'long-password-123','long-password-123');assert.equal(saved.password,'long-password-123');assert.equal(saved.data.signup_password_pending,false);assert.equal(needsPasswordSetup(result),false);
});

import {Readable} from 'node:stream';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAccountDeletionEmail} from '../account-deletion-email.mjs';
import {createAccountRoutes} from '../account-routes.mjs';
import {createMembership} from '../membership.mjs';

const email='verified@example.com';
const token='x'.repeat(30);
const origin='https://example.supabase.co';
const env={MEMBERSHIP_ENABLED:'true',SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture'};

function fixture({deleteStatus=204,send,confirm=true,waitForDelete}={}){
  const events=[];
  const membership=createMembership({env,sendDeletionEmail:async recipient=>{
    events.push(['email',recipient]);
    await send?.();
  },fetcher:async(url,options)=>{
    if(url===origin+'/auth/v1/user'){
      assert.equal(options.headers.Authorization,'Bearer '+token);
      return Response.json({id:'member',email,email_confirmed_at:new Date().toISOString(),last_sign_in_at:new Date().toISOString()});
    }
    assert.equal(url,origin+'/auth/v1/admin/users/member');
    assert.equal(options.method,'DELETE');
    events.push(['delete']);
    await waitForDelete;
    return new Response(null,{status:deleteStatus});
  }});
  const route=createAccountRoutes(membership);
  return {events,async request(){
    const req=Readable.from([Buffer.from(JSON.stringify({confirmation:confirm?'DELETE':'cancel',email:'other@example.com'}))]);
    req.method='POST';
    req.headers={authorization:'Bearer '+token};
    let result;
    await route(req,{setHeader(){}},new URL('https://streamunify.com/api/account/delete'),(_res,status,body)=>{result={status,body};});
    return result;
  }};
}

test('concurrent confirmed requests delete once and email only the verified account owner after success',async()=>{
  let release;
  const waitForDelete=new Promise(resolve=>{release=resolve;});
  const {events,request}=fixture({waitForDelete});
  const requests=[request(),request()];
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events,[['delete']]);
  release();
  for(const result of await Promise.all(requests))assert.deepEqual(result,{status:200,body:{deleted:true}});
  assert.deepEqual(events,[['delete'],['email',email]]);
});

test('unconfirmed and failed deletions never send a confirmation',async()=>{
  const cancelled=fixture({confirm:false});
  await assert.rejects(cancelled.request(),{code:'confirmation_required'});
  assert.deepEqual(cancelled.events,[]);
  const failed=fixture({deleteStatus:503});
  await assert.rejects(failed.request(),{code:'account_unavailable'});
  assert.deepEqual(failed.events,[['delete']]);
});

test('mail rejection leaves deletion successful without logging private error details',async t=>{
  const warn=t.mock.method(console,'warn',()=>{});
  const {request}=fixture({send:async()=>{throw Error('private SMTP error');}});
  assert.deepEqual(await request(),{status:200,body:{deleted:true}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(warn.mock.calls.map(call=>call.arguments),[['Account deletion confirmation email failed']]);
});

test('SMTP sends a branded receipt to one recipient and distinguishes deletion from cancellation',async()=>{
  let message;
  const send=createAccountDeletionEmail({env:{ACCOUNT_DELETION_SMTP_PASSWORD:'fixture'},createTransport:options=>{
    assert.equal(options.secure,true);
    return {async sendMail(input){message=input;return {accepted:[email]};}};
  }});
  await send(email);
  assert.deepEqual(message.to,{address:email});
  assert.equal(message.from.address,'support@streamunify.com');
  assert.equal(message.subject,'Your StreamUnify account was deleted');
  assert.match(message.text,/does not cancel a subscription/);
  await assert.rejects(send('verified@example.com\r\nBcc: other@example.com'));
});

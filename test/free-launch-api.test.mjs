import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createMembership} from '../membership.mjs';
import {createAccountRoutes} from '../account-routes.mjs';

const env={MEMBERSHIP_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
test('free launch status uses a read-only public RPC without impersonating an account',async()=>{
  const membership=createMembership({env,fetcher:async(url,options)=>{
    assert.equal(url,'https://example.supabase.co/rest/v1/rpc/free_launch_status');
    assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,undefined);
    assert.equal(options.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);
    return Response.json(true);
  }});
  assert.equal(await membership.freeLaunchEnabled(),true);
});
test('unknown promotion status fails closed rather than reopening paid checkout',async()=>{
  for(const value of [null,{},'true']){
    const membership=createMembership({env,fetcher:async()=>Response.json(value)});
    await assert.rejects(membership.freeLaunchEnabled(),e=>e.status===503);
  }
});
const request=(path,body={})=>Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]),{method:'POST',headers:{},url:path});
const response={setHeader(){}};
test('free launch suppresses web and native purchasing but preserves subscription management',async()=>{
  const route=createAccountRoutes({publicConfig:()=>({enabled:true}),freeLaunchEnabled:async()=>true},{enabled:true},{publicConfig:()=>({apple:true,google:true,products:{apple:{monthly:'existing'}}})});
  let config;
  await route({method:'GET'},response,new URL('https://example.com/api/account/config'),(_res,_status,data)=>config=data);
  assert.equal(config.freeLaunch,true);assert.equal(config.billingEnabled,false);assert.equal(config.billingManagementEnabled,true);
  assert.equal(config.stores.apple,false);assert.equal(config.stores.google,false);
  assert.equal(config.stores.products.apple.monthly,'existing');
});
test('a client cannot bypass free launch purchase blocking with a direct checkout request',async()=>{
  let charged=false,authenticated=false;
  const route=createAccountRoutes({enabled:true,authenticate:async()=>{authenticated=true;return {id:'verified'};},freeLaunchEnabled:async()=>true},{checkout:async()=>{charged=true;}});
  await assert.rejects(route(request('/api/billing/checkout',{interval:'annual'}),response,new URL('https://example.com/api/billing/checkout'),()=>{}),e=>e.status===409&&e.code==='free_launch_active');
  assert.equal(authenticated,true);assert.equal(charged,false);
});
test('a promotion lookup failure cannot create a subscription',async()=>{
  let charged=false;
  const route=createAccountRoutes({enabled:true,authenticate:async()=>({id:'verified'}),freeLaunchEnabled:async()=>{throw Error('database unavailable');}},{checkout:async()=>{charged=true;}});
  await assert.rejects(route(request('/api/billing/checkout'),response,new URL('https://example.com/api/billing/checkout'),()=>{}));
  assert.equal(charged,false);
});
test('ending free launch restores existing checkout without changing prices or accounts',async()=>{
  const actor={id:'verified'};let checkout;
  const route=createAccountRoutes({enabled:true,authenticate:async()=>actor,freeLaunchEnabled:async()=>false},{checkout:async(who,interval)=>{assert.equal(who,actor);checkout=interval;return {url:'https://checkout.stripe.com/test'};}});
  await route(request('/api/billing/checkout',{interval:'annual'}),response,new URL('https://example.com/api/billing/checkout'),()=>{});
  assert.equal(checkout,'annual');
});

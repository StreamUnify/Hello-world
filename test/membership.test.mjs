import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMembership} from '../membership.mjs';
import {cleanWatchlistItem,restrictCatalog} from '../membership-policy.mjs';

const env={MEMBERSHIP_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
test('membership stays disabled until explicitly configured',()=>{
  assert.deepEqual(createMembership({env:{}}).publicConfig(),{enabled:false});
  assert.throws(()=>createMembership({env:{MEMBERSHIP_ENABLED:'true'}}));
});
test('authentication checks the server identity and rejects unverified users',async()=>{
  let calls=0;
  const client=createMembership({env,fetcher:async(url,options)=>{
    calls++;assert.equal(url,'https://example.supabase.co/auth/v1/user');
    assert.equal(options.headers.Authorization,'Bearer '+ 'x'.repeat(30));
    return Response.json({id:'user',email_confirmed_at:null});
  }});
  await assert.rejects(client.authenticate({headers:{}}),e=>e.status===401);
  assert.equal(calls,0);
  await assert.rejects(client.authenticate({headers:{authorization:'Bearer '+'x'.repeat(30)}}),e=>e.code==='verify_email');
});
test('exhausted quota returns a reset date without granting a search',async()=>{
  const client=createMembership({env,fetcher:async()=>Response.json({allowed:false,remaining:0,reset_at:'2026-11-23'})});
  await assert.rejects(client.consumeSearch({token:'fixture'}),e=>e.status===429&&e.membership.reset_at==='2026-11-23');
});
test('account service failures fail closed without exposing tokens',async()=>{
  const client=createMembership({env,fetcher:async()=>{throw Error('private token');}});
  await assert.rejects(client.status({token:'private token'}),e=>e.status===503&&!e.message.includes('private token'));
});
test('free catalog removes unsupported providers and leaves original data intact',()=>{
  const results=[{id:1,providers:[{name:'Netflix'},{name:'Amazon Prime Video'}]},{id:2,providers:[{name:'Amazon Prime Video'}]}];
  assert.deepEqual(restrictCatalog(results,{plan:'free'}),[{id:1,providers:[{name:'Netflix'}]}]);
  assert.equal(results[0].providers.length,2);
  assert.equal(restrictCatalog(results,{plan:'premium'}),results);
});
test('watchlist snapshots discard unsafe links and privileged fields',()=>{
  const item=cleanWatchlistItem({id:'movie:1',name:' Title ',type:'movie',poster:'javascript:alert(1)',watchUrl:'https://user:pass@example.com',plan:'premium'});
  assert.equal(item.name,'Title');assert.equal(item.poster,'');assert.equal(item.watchUrl,'');assert.equal(item.plan,undefined);
  assert.throws(()=>cleanWatchlistItem({id:'../bad',name:'Title',type:'movie'}));
});

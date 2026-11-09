import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const free='11111111-1111-4111-8111-111111111111';
const paid='22222222-2222-4222-8222-222222222222';
const reviewer='33333333-3333-4333-8333-333333333333';
const unverified='44444444-4444-4444-8444-444444444444';
const session='55555555-5555-4555-8555-555555555555';
test('temporary free launch keeps verified-session authorization and paid/store records intact',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean);
      create table auth.sessions(id uuid,user_id uuid);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('test.session',true))$$;
      insert into auth.users values('${free}',now(),false),('${paid}',now(),false),('${reviewer}',now(),false),('${unverified}',null,false);
      insert into auth.sessions values('${session}','${free}'),('${session}','${paid}'),('${session}','${reviewer}'),('${session}','${unverified}');
    `);
    const sql=name=>readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
    for(const name of ['20261023035846_membership_foundation.sql','20261023224122_native_store_memberships.sql','20261027061109_availability_alerts.sql','20261105040244_store_review_sandbox.sql'])await db.exec(await sql(name));
    await db.query("select public.apply_store_subscription('apple','paid-reference',$1,'com.streamunify.premium.monthly',now()+interval '1 year',now(),'production-reference')",[paid]);
    await db.query("insert into public.store_review_accounts(user_id,expires_at) values($1,now()+interval '7 days')",[reviewer]);
    await db.query("select public.apply_store_sandbox_subscription('apple','test-reference',$1,'com.streamunify.premium.monthly',now()+interval '1 day',now(),'test-reference')",[reviewer]);
    const before={entitlements:(await db.query('select * from public.membership_entitlements order by user_id,source')).rows,stores:(await db.query('select * from public.store_subscriptions')).rows,sandbox:(await db.query('select * from public.store_sandbox_subscriptions')).rows};
    const migration=await sql('20261105042526_temporary_free_launch.sql');await db.exec(migration);await db.exec(migration);
    async function asRole(role,action){await db.exec('set role '+role);try{return await action();}finally{await db.exec('reset role');}}
    async function setActor(actor){await db.query("select set_config('test.actor',$1,false),set_config('test.session',$2,false)",[actor||'',session]);}
    async function member(actor){await setActor(actor);return asRole('authenticated',async()=>(await db.query('select public.membership_status() as status')).rows[0].status);}
    const status=()=>asRole('anon',async()=>(await db.query('select public.free_launch_status() as active')).rows[0].active);
    const setFlag=(enabled,expires=null)=>asRole('service_role',()=>db.query('update streamunify_private.free_launch_settings set enabled=$1,expires_at=$2,updated_at=now() where singleton',[enabled,expires]));
    await t.test('migration defaults OFF and ordinary membership remains limited',async()=>{
      assert.equal(await status(),false);assert.equal((await member(free)).plan,'free');assert.equal((await member(paid)).plan,'premium');
      await setActor(free);await asRole('authenticated',()=>db.query('select public.consume_search()'));
      assert.equal((await member(free)).remaining,9);
    });
    await t.test('only service administration can change the flag; public RPC exposes just a boolean',async()=>{
      for(const role of ['anon','authenticated']){
        await assert.rejects(asRole(role,()=>db.query('update streamunify_private.free_launch_settings set enabled=true')),/permission denied/);
        await assert.rejects(asRole(role,()=>db.query('select * from streamunify_private.free_launch_settings')),/permission denied/);
      }
      assert.equal(typeof await status(),'boolean');await setFlag(true);assert.equal(await status(),true);
      await db.exec(migration);assert.equal(await status(),true,'idempotent rerun must not reset operator flag');
    });
    await t.test('enabled promotion grants unlimited verified access without fake expiry or stored premium grant',async()=>{
      const current=await member(free);assert.deepEqual(current,{plan:'premium',free_launch:true,access_source:'free_launch',premium_until:null,watchlist:true,remaining:null,reset_at:null});
      for(let n=0;n<15;n++){
        const consumed=await asRole('authenticated',async()=>(await db.query('select public.consume_search() as status')).rows[0].status);
        assert.equal(consumed.allowed,true);assert.equal(consumed.remaining,null);
      }
      assert.equal((await db.query('select searches_used from public.search_usage where user_id=$1',[free])).rows[0].searches_used,1,'promo searches do not spend the free quota');
      await asRole('authenticated',()=>db.query("insert into public.watchlist_items(title_id,snapshot) values('movie-test','{}')"));
      assert.equal((await asRole('authenticated',()=>db.query('select * from public.watchlist_items'))).rows.length,1);
      await asRole('authenticated',()=>db.query("insert into public.availability_alerts(user_id,title_id,source_id,media_type,snapshot) values($1,'20',2,'movie','{}')",[free]));
      assert.equal((await asRole('authenticated',()=>db.query('select * from public.availability_alerts'))).rows.length,1);
      assert.deepEqual((await db.query('select * from public.membership_entitlements order by user_id,source')).rows,before.entitlements);
    });
    await t.test('guest, unverified email and missing active session remain denied while promotion is ON',async()=>{
      await assert.rejects(asRole('anon',()=>db.query('select public.membership_status()')),/permission denied/);
      for(const actor of [null,unverified]){
        await assert.rejects(member(actor),/Sign in required|Verified active session required/);
        await assert.rejects(asRole('authenticated',()=>db.query('select streamunify_private.has_premium()')),/Sign in required|Verified active session required/);
      }
      await setActor(free);await db.query("select set_config('test.session','66666666-6666-4666-8666-666666666666',false)");
      await assert.rejects(asRole('authenticated',()=>db.query('select public.membership_status()')),/Verified active session required/);
    });
    await t.test('switching OFF restores prior quota and paid/review access without deleting saved data',async()=>{
      await setFlag(false);assert.equal(await status(),false);
      const current=await member(free);assert.equal(current.plan,'free');assert.equal(current.free_launch,false);assert.equal(current.remaining,9);
      assert.equal((await asRole('authenticated',()=>db.query('select * from public.watchlist_items'))).rows.length,0,'watchlist RLS restores paid restriction');
      assert.equal((await db.query('select * from public.watchlist_items where user_id=$1',[free])).rows.length,1,'saved data is retained');
      assert.equal((await member(paid)).plan,'premium');assert.equal((await member(reviewer)).plan,'premium');
      assert.deepEqual((await db.query('select * from public.membership_entitlements order by user_id,source')).rows,before.entitlements);
      assert.deepEqual((await db.query('select * from public.store_subscriptions')).rows,before.stores);
      assert.deepEqual((await db.query('select * from public.store_sandbox_subscriptions')).rows,before.sandbox);
    });
    await t.test('optional expiry disables access automatically and a missing flag fails closed',async()=>{
      await setFlag(true,new Date(Date.now()+3600000));assert.equal(await status(),true);assert.equal((await member(free)).plan,'premium');
      await setFlag(true,new Date(Date.now()-60000));assert.equal(await status(),false);assert.equal((await member(free)).plan,'free');
      await asRole('service_role',()=>db.query('delete from streamunify_private.free_launch_settings'));
      assert.equal(await status(),false);assert.equal((await member(free)).plan,'free');
    });
  }finally{await db.close();}
});

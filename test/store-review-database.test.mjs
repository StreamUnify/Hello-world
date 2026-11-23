import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const reviewer='11111111-1111-4111-8111-111111111111';
const paid='22222222-2222-4222-8222-222222222222';
const ordinary='33333333-3333-4333-8333-333333333333';
const session='44444444-4444-4444-8444-444444444444';
test('review migration preserves production, isolates sandbox ownership, and enforces expiry and RLS',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean);
      create table auth.sessions(id uuid,user_id uuid);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('test.session',true))$$;
      insert into auth.users values('${reviewer}',now(),false),('${paid}',now(),false),('${ordinary}',now(),false);
      insert into auth.sessions values('${session}','${reviewer}'),('${session}','${paid}'),('${session}','${ordinary}');
    `);
    const sql=name=>readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
    await db.exec(await sql('20261023035846_membership_foundation.sql'));
    await db.exec(await sql('20261023224122_native_store_memberships.sql'));
    await db.query(`select public.apply_store_subscription('apple','same-reference',$1,'com.streamunify.premium.monthly',now()+interval '1 year',now(),'production-reference')`,[paid]);
    const before=(await db.query('select * from public.membership_entitlements')).rows;
    const migration=await sql('20261105040244_store_review_sandbox.sql');
    await db.exec(migration);await db.exec(migration);
    assert.deepEqual((await db.query('select * from public.membership_entitlements')).rows,before);
    async function asRole(role,action){await db.exec('set role '+role);try{return await action();}finally{await db.exec('reset role');}}
    async function member(actor){await db.query("select set_config('test.actor',$1,false),set_config('test.session',$2,false)",[actor,session]);return asRole('authenticated',async()=>(await db.query('select public.membership_status() as status')).rows[0].status);}
    const save=(id,ref='same-reference',expiry="now()+interval '1 year'",checked='now()',previous='null')=>asRole('service_role',()=>db.query(`select public.apply_store_sandbox_subscription('apple',$1,$2,'com.streamunify.premium.monthly',${expiry},${checked},'sandbox-reference',${previous})`,[ref,id]));

    await t.test('ordinary users cannot approve themselves, persist sandbox purchases, or call service RPCs',async()=>{
      await assert.rejects(asRole('authenticated',()=>db.query('insert into public.store_review_accounts(user_id,expires_at) values($1,now()+interval \'1 day\')',[ordinary])),/permission denied/);
      await assert.rejects(asRole('authenticated',()=>db.query('select public.store_review_access($1)',[ordinary])),/permission denied/);
      await assert.rejects(asRole('anon',()=>db.query('select public.store_review_access($1)',[ordinary])),/permission denied/);
      await assert.rejects(save(ordinary),/Approved review account required/);
      assert.equal((await member(ordinary)).plan,'free');
    });
    await t.test('approved sandbox expiry is bounded to approval and never modifies production records',async()=>{
      await db.query("insert into public.store_review_accounts(user_id,expires_at) values($1,now()+interval '1 day')",[reviewer]);
      await save(reviewer);
      const status=await member(reviewer);assert.equal(status.plan,'premium');assert.equal(status.watchlist,true);
      const approval=(await db.query('select expires_at from public.store_review_accounts where user_id=$1',[reviewer])).rows[0];
      assert.equal(Date.parse(status.premium_until),new Date(approval.expires_at).getTime());
      assert.deepEqual((await db.query('select * from public.membership_entitlements')).rows,before);
      assert.equal((await db.query('select user_id from public.store_subscriptions where external_reference=$1',['same-reference'])).rows[0].user_id,paid);
      assert.equal((await db.query('select user_id from public.store_sandbox_subscriptions where external_reference=$1',['same-reference'])).rows[0].user_id,reviewer);
      assert.equal((await member(paid)).plan,'premium');
    });
    await t.test('sandbox ownership cannot transfer and stale checks cannot resurrect revoked access',async()=>{
      await db.query("insert into public.store_review_accounts(user_id,expires_at) values($1,now()+interval '1 day')",[ordinary]);
      await assert.rejects(save(ordinary),/Purchase belongs to another account/);
      await save(reviewer,'same-reference',"'epoch'", "now()+interval '1 minute'");
      await save(reviewer,'same-reference',"now()+interval '1 year'",'now()');
      assert.equal((await member(reviewer)).plan,'free');
      await save(reviewer,'same-reference',"now()+interval '1 year'", "now()+interval '2 minutes'");
      assert.equal((await member(reviewer)).plan,'premium');
    });
    await t.test('removing review approval revokes sandbox access immediately while production remains unchanged',async()=>{
      await db.query('delete from public.store_review_accounts where user_id=$1',[reviewer]);
      assert.equal((await member(reviewer)).plan,'free');assert.equal((await member(paid)).plan,'premium');
      await assert.rejects(save(reviewer),/Approved review account required/);
      assert.deepEqual((await db.query('select * from public.membership_entitlements')).rows,before);
    });
    await t.test('expired approval fails closed for both membership and service writes',async()=>{
      await db.query("insert into public.store_review_accounts(user_id,approved_at,expires_at) values($1,now()-interval '2 days',now()-interval '1 day')",[reviewer]);
      assert.equal((await member(reviewer)).plan,'free');await assert.rejects(save(reviewer),/Approved review account required/);
      const allowed=await asRole('service_role',async()=>(await db.query('select public.store_review_access($1) as allowed',[reviewer])).rows[0].allowed);assert.equal(allowed,false);
      await assert.rejects(db.query("update public.store_review_accounts set approved_at=now(),expires_at=now()+interval '31 days' where user_id=$1",[reviewer]),/check constraint/);
    });
    await t.test('authenticated users cannot inspect review records or another account expiry helper',async()=>{
      await assert.rejects(asRole('authenticated',()=>db.query('select * from public.store_sandbox_subscriptions')),/permission denied/);
      await assert.rejects(asRole('authenticated',()=>db.query('select streamunify_private.premium_until($1)',[paid])),/permission denied/);
    });
  }finally{await db.close();}
});

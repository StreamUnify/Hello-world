import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingServices,cleanAlertPreferences,cleanAlertTitle} from '../availability-policy.mjs';
import {createAvailabilityAlerts} from '../availability-alerts.mjs';

test('availability alerts match selected subscriptions/free offers, excluding rentals and purchases',()=>{
 assert.deepEqual(matchingServices([{name:'Netflix',type:'Subscription'},{name:'Amazon Video',type:'Rent'},{name:'Apple TV',type:'Buy'},{name:'Tubi TV',type:'Ad-supported'},{name:'Hulu',type:'Subscription'}],['netflix','prime','apple','tubi']),['netflix','tubi']);
 assert.deepEqual(cleanAlertPreferences({country:'US',services:['netflix','netflix']},{plan:'free'}).service_ids,['netflix']);
 assert.throws(()=>cleanAlertPreferences({country:'GB',services:['netflix']},{plan:'free'}),/Premium/);
 assert.throws(()=>cleanAlertPreferences({country:'US',services:['invented']},{plan:'premium'}),/Invalid/);
 assert.deepEqual(cleanAlertTitle({id:6030,type:'movie'}),{type:'movie',sourceId:603,title_id:'6030'});
 assert.throws(()=>cleanAlertTitle({id:'youtube:x',type:'video'}),/movie or TV/);
});
test('failed availability checks never write a false removal baseline',async()=>{
 const paths=[];const env={SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SECRET_KEY:'secret'};
 const alerts=createAvailabilityAlerts({env,membership:{enabled:true},catalog:{async availability(){throw Error('catalog offline');}},fetcher:async url=>{
  const path=new URL(url).pathname;paths.push(path);
  if(path.endsWith('/membership_entitlements'))return Response.json([]);
  if(path.endsWith('/availability_alerts'))return Response.json([{user_id:'user',title_id:'6030',source_id:603,media_type:'movie',checked_at:null}]);
  if(path.endsWith('/availability_preferences'))return Response.json([{user_id:'user',country:'US',service_ids:['netflix'],updated_at:new Date().toISOString()}]);
  throw Error('No baseline write should occur');
 }});
 await alerts.tick();assert.equal(paths.some(x=>x.includes('record_availability_check')),false);
});

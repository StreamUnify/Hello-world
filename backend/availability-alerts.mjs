import {MembershipError,cleanWatchlistItem,FREE_PROVIDERS} from './membership-policy.mjs';
import {cleanAlertPreferences,cleanAlertTitle,matchingServices} from './availability-policy.mjs';

export function createAvailabilityAlerts({env=process.env,catalog,membership,fetcher=fetch,now=Date.now}={}){
 const origin=env.SUPABASE_URL||'',key=env.SUPABASE_PUBLISHABLE_KEY||'',secret=env.SUPABASE_SECRET_KEY||'';
 const enabled=membership.enabled&&!!secret;
 let running=false;
 async function request(path,token=secret,{method='GET',body,headers={}}={}){
  const res=await fetcher(origin+'/rest/v1/'+path,{method,headers:{apikey:token===secret?secret:key,Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw new MembershipError(503,'alerts_unavailable','Availability alerts are temporarily unavailable');
  const text=await res.text();return text?JSON.parse(text):null;
 }
 const requireEnabled=()=>{if(!enabled)throw new MembershipError(503,'alerts_unavailable','Availability alerts are not available yet');};
 async function permittedPreferences(pref,actor){
  const premium=actor?(await membership.status(actor)).plan==='premium':(await request('membership_entitlements?select=user_id&user_id=eq.'+pref.user_id+'&premium_until=gt.'+encodeURIComponent(new Date(now()).toISOString())+'&limit=1')).length>0;
  return premium?pref:{...pref,service_ids:pref.country==='US'?pref.service_ids.filter(id=>FREE_PROVIDERS.includes(id)):[]};
 }
 async function preferences(actor,input){
  requireEnabled();const value=cleanAlertPreferences(input,await membership.status(actor));
  const rows=await request('availability_preferences?on_conflict=user_id',actor.token,{method:'POST',body:{user_id:actor.id,...value,updated_at:new Date(now()).toISOString()},headers:{Prefer:'resolution=merge-duplicates,return=representation'}});
  return rows[0];
 }
 async function check(alert,prefs){
  // Catalog failure leaves the last successful baseline intact.
  const data=await catalog.availability(alert.media_type,alert.source_id,prefs.country);
  const matched=matchingServices(data.providers,prefs.service_ids);
  await request('rpc/record_availability_check',secret,{method:'POST',body:{p_user_id:alert.user_id,p_title_id:alert.title_id,p_services:matched,p_country:prefs.country}});
  return matched;
 }
 async function refresh(actor){
  const savedPref=(await request('availability_preferences?user_id=eq.'+actor.id,actor.token))[0];if(!savedPref)return;
  const pref=await permittedPreferences(savedPref,actor);
  const alerts=await request('availability_alerts?user_id=eq.'+actor.id+'&order=checked_at.asc.nullsfirst&limit=100',actor.token);
  let checked=0;for(const alert of alerts){
   if(alert.checked_at&&Date.parse(alert.checked_at)>now()-21600000&&Date.parse(alert.checked_at)>=Date.parse(pref.updated_at))continue;
   if(checked++>=5)break;
   try{await check(alert,pref);}catch{/* Retry later; never interpret a failed lookup as removal. */}
  }
  return pref;
 }
 return {
  enabled,preferences,
  async subscribe(actor,input){
   requireEnabled();const title=cleanAlertTitle(input.title),prefs=await preferences(actor,input);
   if(!prefs.service_ids.length)throw new MembershipError(400,'services_required','Select at least one streaming service first');
   const current=await request('availability_alerts?select=title_id&user_id=eq.'+actor.id,actor.token);
   if(current.length>=100&&!current.some(x=>x.title_id===title.title_id))throw new MembershipError(400,'alert_limit','You can track up to 100 titles. Remove an alert to add another.');
   const details=await catalog.details(title.type,title.sourceId,prefs.country);
   const snapshot=cleanWatchlistItem(details.title);
   await request('availability_alerts?on_conflict=user_id,title_id',actor.token,{method:'POST',body:{user_id:actor.id,title_id:title.title_id,source_id:title.sourceId,media_type:title.type,snapshot},headers:{Prefer:'resolution=ignore-duplicates'}});
   // A first check establishes the baseline; titles already available do not
   // generate an unsolicited "newly available" event.
   try{const matched=await check({user_id:actor.id,...title,media_type:title.type,source_id:title.sourceId},prefs);return {availableNow:matched};}
   catch{return {availableNow:[],availabilityPending:true};}
  },
  async remove(actor,id){requireEnabled();if(!/^\d{2,11}$/.test(id))throw new MembershipError(400,'invalid_title','Invalid title');await request('availability_alerts?user_id=eq.'+actor.id+'&title_id=eq.'+id,actor.token,{method:'DELETE'});},
  async list(actor){
   requireEnabled();const prefs=await refresh(actor);
   const [alerts,notifications]=await Promise.all([
    request('availability_alerts?select=title_id,snapshot,checked_at&user_id=eq.'+actor.id+'&order=created_at.desc&limit=100',actor.token),
    request('availability_notifications?user_id=eq.'+actor.id+'&order=created_at.desc&limit=100',actor.token),
   ]);return {alerts,notifications,preferences:prefs,delivery:'in_app',checkIntervalHours:6};
  },
  async markRead(actor,id){requireEnabled();if(!/^[0-9a-f-]{36}$/.test(id))throw new MembershipError(400,'invalid_notification','Invalid notification');await request('availability_notifications?user_id=eq.'+actor.id+'&id=eq.'+id,actor.token,{method:'PATCH',body:{read_at:new Date(now()).toISOString()}});},
  async tick(){
   if(!enabled||running)return;running=true;
   try{
    const rows=await request('availability_alerts?order=checked_at.asc.nullsfirst&limit=60');
    const prefs=new Map();
    for(const alert of rows){
     if(!prefs.has(alert.user_id)){const saved=(await request('availability_preferences?user_id=eq.'+alert.user_id))[0];prefs.set(alert.user_id,saved?await permittedPreferences(saved):null);}
     const pref=prefs.get(alert.user_id);if(!pref)continue;
     if(alert.checked_at&&Date.parse(alert.checked_at)>now()-21600000&&Date.parse(alert.checked_at)>=Date.parse(pref.updated_at))continue;
     try{await check(alert,pref);}catch{/* Keep prior successful data; bounded retry on next tick. */}
    }
   }finally{running=false;}
  },
 };
}

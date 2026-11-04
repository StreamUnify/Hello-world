import {createHash} from 'node:crypto';
import {STREAMING_SERVICES} from './streaming-services.mjs';
import {addonIdentity,validAddonId} from './provider-entitlements-src.mjs';
import {restrictCatalog,MembershipError} from './membership-policy.mjs';
import {CONTENT_RATINGS} from './content-ratings.mjs';
export const PICK_GENRES=Object.freeze({'Comedy':35,'Mystery':9648,'Adventure':12,'Romance':10749,'Sci-fi':878,'Drama':18,'Action':28,'Animation':16});
export const PICK_MOODS=Object.freeze({Fun:[35,12],Cozy:[16,10749,10751],Surprising:[9648,878],Intense:[28,53,18]});
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Same explicit provider labels used by the main catalog UI; never infer a provider by ID.
const aliases={amazonprimevideo:'prime',amazonvideo:'prime',disneyplus:'disney',hulu:'hulu',netflix:'netflix',appletvplus:'apple',appletv:'apple',max:'max',hbomax:'max',paramountplus:'paramount',peacockpremium:'peacock',peacock:'peacock',tubitv:'tubi',tubi:'tubi',plutotv:'pluto',thechannel:'roku',rokuchannel:'roku',mgmplus:'mgm',amcplus:'amc',discoveryplus:'discovery',crunchyroll:'crunchyroll',mubi:'mubi',starz:'starz',britbox:'britbox',shudder:'shudder',plex:'plex',youtube:'youtube',fandangoathome:'fandango',googleplaymovies:'google_tv',viki:'viki'};
const serviceIds=new Set(STREAMING_SERVICES.map(s=>s.id));
export function validatePickPreferences(input){
 const fail=()=>{throw new MembershipError(400,'invalid_preferences','Choose two people, supported genres and moods, services, and a runtime limit.');};
 if(!input||typeof input!=='object'||!Array.isArray(input.people)||input.people.length!==2||!Array.isArray(input.services)||input.services.length>150||typeof input.extras!=='boolean'||![105,120,150,999].includes(input.runtime))fail();
 const people=input.people.map(p=>{
  if(!p||!Array.isArray(p.genres)||p.genres.length<1||p.genres.length>8||p.genres.some(g=>!Object.hasOwn(PICK_GENRES,g))||!Object.hasOwn(PICK_MOODS,p.mood)||typeof p.favorite!=='string'||p.favorite.length>120)fail();
  return {genres:[...new Set(p.genres)],mood:p.mood,favorite:p.favorite.trim()};
 });
 if(input.services.some(s=>typeof s!=='string'||(!serviceIds.has(s)&&!validAddonId(s))))fail();
 return {people,services:[...new Set(input.services)],extras:input.extras,runtime:input.runtime};
}
export function matchedPickProviders(providers,prefs){
 const selected=new Set(prefs.services);
 return (providers||[]).flatMap(p=>{
  const addon=p.addon||addonIdentity(p.name);
  const serviceId=addon?.id||aliases[norm(p.name)]||STREAMING_SERVICES.find(s=>norm(s.name)===norm(p.name))?.id;
  const included=['Subscription','free','Ad-supported'].includes(p.type);
  const paid=['Rent','Buy'].includes(p.type);
  if(addon){
   if(included&&selected.has(addon.id))return [{...p,serviceId,addon,extraCost:false}];
   if(included&&prefs.extras&&selected.has(addon.hostId))return [{...p,serviceId,addon,extraCost:true,costNote:'Separate add-on subscription required'}];
   return [];
  }
  if(!serviceId||!selected.has(serviceId)||(!included&&!(prefs.extras&&paid)))return [];
  return [{...p,serviceId,extraCost:paid,...paid?{costNote:p.type==='Rent'?'Rental payment required':'Purchase payment required'}:{}}];
 });
}
export function pickScore(ids,prefs,favorites=[]){
 const fits=prefs.people.map((p,i)=>{
  const genreFit=p.genres.filter(g=>ids.includes(PICK_GENRES[g])).length/p.genres.length;
  const moodFit=PICK_MOODS[p.mood].some(id=>ids.includes(id))?1:0;
  const favoriteFit=(favorites[i]||[]).some(id=>ids.includes(id))?1:0;
  return genreFit*4+moodFit*.5+favoriteFit*.5;
 });
 return Math.min(...fits)*2+fits.reduce((a,b)=>a+b,0);
}
export async function runPickTogether({catalog,membership,stores,req,preferences,country,language,rating=''}){
 const prefs=validatePickPreferences(preferences);
 if(rating&&!CONTENT_RATINGS.includes(rating))throw new MembershipError(400,'invalid_rating','Invalid content rating');
 let actor,status;
 if(membership.enabled){actor=await membership.authenticate(req);await stores.refreshActor(actor);status=await membership.status(actor);if(status.plan!=='premium')country='US';}
 const data=await catalog.pickTogether(prefs,country,{language,rating,restrict:items=>membership.enabled?restrictCatalog(items,status):items});
 if(membership.enabled){
  if(data.sources?.tmdb!=='ok')throw new MembershipError(503,'catalog_unavailable','Recommendations are temporarily unavailable. Your allowance was not used.');
  status=await membership.consumeSearch(actor,req.headers['x-search-id'],country+':pick-together:'+createHash('sha256').update(JSON.stringify({prefs,language,rating})).digest('hex'));
  data.membership=status;
 }
 return data;
}

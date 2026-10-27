import {STREAMING_SERVICES} from './streaming-services.mjs';
import {MembershipError,FREE_PROVIDERS} from './membership-policy.mjs';
export const COUNTRIES=new Set('US CA GB AU NZ IN FR DE ES IT AT BR MX AR CO KR JP SG MY PH ID AE SA ZA NG'.split(' '));
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={amazonprimevideo:'prime',amazonprimevideowithads:'prime',disneyplus:'disney',appletvplus:'apple',hbomax:'max',paramountplus:'paramount',paramountpluspremium:'paramount',paramountplusessential:'paramount',peacockpremium:'peacock',peacockpremiumplus:'peacock',tubitv:'tubi',plutotv:'pluto',therokuchannel:'roku',mgmplus:'mgm',amcplus:'amc',discoveryplus:'discovery',youtubetv:'youtube_tv'};
export function providerServiceId(name){const key=norm(name);return aliases[key]||STREAMING_SERVICES.find(s=>norm(s.name)===key)?.id||null;}
export function matchingServices(providers,ids){
 const selected=new Set(ids);return [...new Set((providers||[]).filter(p=>['subscription','free','adsupported','freewithads'].includes(norm(p.type))).map(p=>providerServiceId(p.name)).filter(id=>selected.has(id)))].sort();
}
export function cleanAlertPreferences(input,status){
 if(!input||!COUNTRIES.has(input.country)||!Array.isArray(input.services)||input.services.length>100)throw new MembershipError(400,'invalid_preferences','Choose a country and valid streaming services');
 const allowed=new Set(STREAMING_SERVICES.map(x=>x.id));
 if(input.services.some(x=>typeof x!=='string'||!allowed.has(x)))throw new MembershipError(400,'invalid_preferences','Invalid streaming service');
 if(status?.plan!=='premium'&&(input.country!=='US'||input.services.some(x=>!FREE_PROVIDERS.includes(x))))throw new MembershipError(403,'premium_required','These services or countries require Premium');
 return {country:input.country,service_ids:[...new Set(input.services)].sort()};
}
export function cleanAlertTitle(input){
 const type=input?.type,id=Number(input?.sourceId||(Number(input?.id)-(type==='series'?1:0))/10);
 if(!['movie','series'].includes(type)||!Number.isSafeInteger(id)||id<1||id>2147483647)throw new MembershipError(400,'invalid_title','Choose a movie or TV show from search');
 return {type,sourceId:id,title_id:String(id*10+(type==='series'?1:0))};
}

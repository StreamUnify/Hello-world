// Route-specific entitlements. A base subscription never implies a channel add-on.
// Match explicit source labels only; this does not assert title or regional availability.
export const ADDON_HOSTS=Object.freeze({
 amazon:{hostId:'prime',name:'Prime Video Channels',url:'https://www.amazon.com/gp/video/storefront'},
 apple:{hostId:'apple',name:'Apple TV Channels',url:'https://tv.apple.com/'},
 roku:{hostId:'roku',name:'The Roku Channel',url:'https://therokuchannel.roku.com/'},
 hulu:{hostId:'hulu',name:'Hulu',url:'https://www.hulu.com/'},
 youtube:{hostId:'youtube',name:'YouTube Primetime Channels',url:'https://www.youtube.com/'},
});
const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const brands={max:['max','HBO Max'],hbomax:['max','HBO Max'],hbo:['hbo','HBO'],paramountplus:['paramount','Paramount+'],paramountpluswithshowtime:['paramount-showtime','Paramount+ with SHOWTIME'],starz:['starz','STARZ'],discoveryplus:['discovery','discovery+'],mgmplus:['mgm','MGM+'],epix:['mgm','MGM+'],amcplus:['amc','AMC+'],appletvplus:['apple','Apple TV+']};
const patterns=[
 ['amazon',/^(.*?)\s*\(Via Amazon Prime\)\s*$/i],['amazon',/^(.*?)\s+(?:Amazon|Amazon Prime Video)\s+Channels?\s*$/i],
 ['apple',/^(.*?)\s*\(Via Apple TV\)\s*$/i],['apple',/^(.*?)\s+Apple TV\s+Channels?\s*$/i],
 ['roku',/^(.*?)\s+(?:The )?Roku\s+(?:Premium\s+)?Channels?\s*$/i],
 ['hulu',/^(.*?)\s*\(Via Hulu\)\s*$/i],['hulu',/^(.*?)\s+Hulu\s+(?:Add-on|Channel)\s*$/i],
 ['youtube',/^(.*?)\s+YouTube\s+Primetime\s+Channels?\s*$/i],
];
export function addonIdentity(name){
 if(typeof name!=='string'||name.length>200)return null;
 for(const [host,pattern] of patterns){const match=name.trim().match(pattern);if(!match)continue;
  const product=match[1].trim(),key=norm(product);if(!key||key.length>80)return null;
  const [slug,label]=(Object.hasOwn(brands,key)?brands[key]:[key,product]),route=ADDON_HOSTS[host];
  return {id:`addon:${host}:${slug}`,name:`${label} via ${route.name}`,product:label,host,hostId:route.hostId,addon:true};
 }
 return null;
}
export function validAddonId(id){return typeof id==='string'&&/^addon:(amazon|apple|roku|hulu|youtube|source):[a-z0-9][a-z0-9-]{0,79}$/.test(id);}
export function addonService(name,country){const identity=addonIdentity(name);if(!identity)return null;return {...identity,countries:[country],region:country,kind:'Subscription add-on',color:'#8d9eed',url:ADDON_HOSTS[identity.host].url};}
// Watchmode's TV-Everywhere (tve) requires authentication; it is not free or a sub offer.
export function watchmodeOffer(row,country){
 if(!row||row.region!==country||typeof row.name!=='string'||!row.name.trim()||row.name.length>200)return null;
 const type={sub:'Subscription',rent:'Rent',buy:'Buy',free:'Ad-supported'}[row.type];if(!Object.hasOwn({sub:1,rent:1,buy:1,free:1},row.type)||!type)return null;
 let url='';try{const u=new URL(row.web_url);if(u.protocol==='https:'&&!u.username&&!u.password)url=u.href;}catch{}
 return {id:row.source_id,name:row.name,type,url,source:'watchmode',...(Number.isFinite(row.price)&&row.price>=0?{price:row.price}:{}),...(typeof row.format==='string'?{format:row.format}:{})};
}

// Watchmode directory supplies explicit host relationships; no base entitlement is inferred.
export function sourceAddon(source,country){
 if(!source||source.type!=='sub'||!Number.isSafeInteger(source.id)||source.id<=0||!Number.isSafeInteger(source.host_source_id)||source.host_source_id<=0||typeof source.host_source!=='string'||!source.host_source.trim()||typeof source.name!=='string'||!source.name.trim()||source.name.length>200||!Array.isArray(source.regions)||!source.regions.includes(country))return null;
 const hostNames={amazon:'amazon',amazonprime:'amazon',amazonprimevideo:'amazon',primevideo:'amazon',apple:'apple',appletv:'apple',roku:'roku',therokuchannel:'roku',hulu:'hulu',youtube:'youtube'};
 const hostKey=norm(source.host_source),host=Object.hasOwn(hostNames,hostKey)?hostNames[hostKey]:null;
 let identity=addonIdentity(source.name);
 // Conflicting route labels cannot confer a different carrier's entitlement.
 if(identity&&(!host||identity.host!==host))return null;
 if(host&&!identity){const suffix={amazon:' (Via Amazon Prime)',apple:' (Via Apple TV)',roku:' Roku Channel',hulu:' (Via Hulu)',youtube:' YouTube Primetime Channel'}[host];identity=addonIdentity(source.name+suffix);}
 if(!identity)identity={id:'addon:source:'+source.id,name:source.name+' via '+source.host_source,product:source.name,host:'source',hostId:'source:'+source.host_source_id,addon:true};
 return {...identity,countries:[country],region:country,kind:'Subscription add-on',color:'#8d9eed',url:ADDON_HOSTS[identity.host]?.url||'',source:'watchmode',providerIds:[source.id]};
}

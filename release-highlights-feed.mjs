// Public, durable daily snapshot. Never substitutes theatrical dates or stale examples.
const DAY=86400000;
export const SNAPSHOT_URL='https://raw.githubusercontent.com/StreamUnify/Hello-world/data/release-highlights/release-highlights.json';
const sources=new Set(['www.aboutamazon.com','www.netflix.com','press.wbd.com']);
const imageHosts=new Set(['www.aboutamazon.com','assets.aboutamazon.com','m.media-amazon.com','images-na.ssl-images-amazon.com','dnm.nflximg.net','occ-0-0.nflxso.net','about.netflix.com','media.netflix.com']);
export function nextDailyRefresh(now=Date.now()){const n=new Date(now);n.setUTCHours(6,0,0,0);if(n.getTime()<=now)n.setUTCDate(n.getUTCDate()+1);return n.toISOString();}
const urlOk=(value,hosts)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.has(u.hostname);}catch{return false;}};
export function validateReleaseSnapshot(input,country,now=Date.now()){
 const checked=Date.parse(input?.checkedAt),expires=Date.parse(input?.expiresAt);
 const empty={checkedAt:null,expiresAt:null,nextRefreshAt:nextDailyRefresh(now),releases:[],status:'unavailable'};
 if(!Number.isFinite(checked)||checked>now+300000||now-checked>=2*DAY||!Number.isFinite(expires)||expires<=now||expires>checked+2*DAY||!Array.isArray(input.releases))return empty;
 const seen=new Set();const releases=input.releases.slice(0,200).filter(r=>{
  if(!r||typeof r.id!=='string'||r.id.length>300||typeof r.title!=='string'||!r.title.trim()||r.title.length>220||!['netflix','prime','max'].includes(r.provider)||!Array.isArray(r.countries)||!r.countries.includes(country)||!r.countries.every(c=>/^[A-Z]{2}$/.test(c)))return false;
  const date=Date.parse(r.streamingDate+'T00:00:00Z'),verified=Date.parse(r.verifiedAt);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.streamingDate)||!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==r.streamingDate||!Number.isFinite(verified)||verified>checked+300000||verified>now+300000||now-verified>=2*DAY||!urlOk(r.sourceUrl,sources)||!urlOk(r.image,imageHosts))return false;
  const day=Math.floor(now/DAY)*DAY;if(date<day-14*DAY||date>day+31*DAY||seen.has(r.id))return false;seen.add(r.id);return true;
 }).map(r=>({id:r.id,title:r.title.trim(),provider:r.provider,providerName:String(r.providerName||r.provider).slice(0,80),streamingDate:r.streamingDate,countries:r.countries,image:r.image,description:String(r.description||'').slice(0,280),sourceUrl:r.sourceUrl,verifiedAt:r.verifiedAt}));
 return {checkedAt:new Date(checked).toISOString(),expiresAt:new Date(expires).toISOString(),nextRefreshAt:nextDailyRefresh(now),releases,status:releases.length?'ok':'no_verified_releases'};
}
export function createReleaseHighlights({fetcher=fetch,clock=Date.now}={}){
 let snapshot=null,nextFetch=0,pending;
 async function refresh(){try{
  const res=await fetcher(SNAPSHOT_URL,{signal:AbortSignal.timeout(8000),redirect:'error',headers:{Accept:'application/json'}});
  if(!res.ok)throw Error('Snapshot unavailable');
  if(Number(res.headers?.get('content-length')||0)>1000000)throw Error('Snapshot too large');
  let text='',bytes=0;const decoder=new TextDecoder();for await(const chunk of res.body){bytes+=chunk.byteLength;if(bytes>1000000)throw Error('Snapshot too large');text+=decoder.decode(chunk,{stream:true});}text+=decoder.decode();
  const parsed=JSON.parse(text);if(!Array.isArray(parsed.releases))throw Error('Invalid snapshot');snapshot=parsed;nextFetch=clock()+900000;
 }catch{nextFetch=clock()+60000;}finally{pending=null;}}
 return {async get(country){if(clock()>=nextFetch){if(!pending)pending=refresh();await pending;}return validateReleaseSnapshot(snapshot,country,clock());}};
}

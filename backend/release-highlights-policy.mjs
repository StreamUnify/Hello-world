// UI admission policy: no unverified, stale, undated, wrong-country or unsafe-link cards.
export const DAY_MS=86400000;
export function publicHttps(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!/^(localhost|127\.|0\.|\[|10\.|192\.168\.|169\.254\.)/i.test(u.hostname)?u.href:null;}catch{return null;}}
export function normalizeHighlights(snapshot,country,now=Date.now()){
 const checked=Date.parse(snapshot?.checkedAt),expires=Date.parse(snapshot?.expiresAt);
 if(!Number.isFinite(checked)||!Number.isFinite(expires)||checked>now+300000||now-checked>2*DAY_MS||expires<=now||!Array.isArray(snapshot?.releases))return [];
 const seen=new Set();return snapshot.releases.slice(0,100).flatMap(r=>{
  const verified=Date.parse(r.verifiedAt),date=/^\d{4}-\d{2}-\d{2}$/.test(r.streamingDate||'')?Date.parse(r.streamingDate+'T00:00:00Z'):NaN;
  const image=publicHttps(r.image),source=publicHttps(r.sourceUrl);
  if(!r.title||typeof r.title!=='string'||r.title.length>220||!r.provider||!Array.isArray(r.countries)||!r.countries.includes(country)||!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==r.streamingDate||!Number.isFinite(verified)||verified>now+300000||now-verified>2*DAY_MS||!image||!source)return [];
  const age=(Math.floor(now/DAY_MS)*DAY_MS-date)/DAY_MS,lane=age>=0&&age<14?'new':age<0&&age>=-30?'soon':null;
  const key=[r.provider,r.title,r.streamingDate].join('|');if(!lane||seen.has(key))return [];seen.add(key);
  return [{id:r.id||key,provider:r.provider,providerName:String(r.providerName||r.provider),title:r.title,date:r.streamingDate,lane,image,source,countries:r.countries,description:String(r.description||'').slice(0,280),territory:String(r.territory||country).slice(0,80),verifiedAt:new Date(verified).toISOString(),expiresAt:Math.min(expires,checked+2*DAY_MS,verified+2*DAY_MS)}];
 });
}

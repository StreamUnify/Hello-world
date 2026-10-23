export const MEMBERSHIP_PRICES = Object.freeze({currency:'usd', monthly:299, annual:3000});
export const FREE_PROVIDERS = Object.freeze(['netflix','disney','hulu','peacock','sling','max','discovery','paramount','cue','tubi']);
const aliases = new Map(Object.entries({
  netflix:'netflix', disneyplus:'disney', disney:'disney', hulu:'hulu',
  peacock:'peacock', peacockpremium:'peacock', peacockpremiumplus:'peacock',
  sling:'sling', slingtv:'sling', slingorange:'sling', slingblue:'sling',
  max:'max', hbomax:'max', hbomaxamazonchannel:'max',
  discoveryplus:'discovery', discoveryplusamazonchannel:'discovery',
  paramountplus:'paramount', paramountpluswithshowtime:'paramount',
  cuebroadcast:'cue', tubi:'tubi', tubitv:'tubi',
}));
export function freeProviderId(name) {
  return aliases.get(String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'')) || null;
}
export function restrictCatalog(results, membership) {
  if (membership?.plan === 'premium') return results;
  return results.map(t=>({...t, ...(t.watchUrl?{watchUrl:''}:{}),providers:(t.providers||[]).filter(p=>freeProviderId(p.name))}))
    .filter(t=>t.providers.length>0);
}
export class MembershipError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export function cleanWatchlistItem(input) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new MembershipError(400,'invalid_title','Invalid title');
  const id=String(input.id??'');
  if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(id) || typeof input.name!=='string' || !input.name.trim() || !['movie','series','video','channel','podcast'].includes(input.type)) throw new MembershipError(400,'invalid_title','Invalid title');
  const url=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}};
  return {id,name:input.name.trim().slice(0,200),type:input.type,year:String(input.year||'').slice(0,4),desc:String(input.desc||'').slice(0,5000),poster:url(input.poster),watchUrl:url(input.watchUrl)};
}

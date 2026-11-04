// Website-only preference and display helpers. Recommendations come from the API.
export const genres=['Comedy','Mystery','Adventure','Romance','Sci-fi','Drama','Action','Animation','Horror'];
export const moods=['Fun','Cozy','Surprising','Intense'];
export const services=[{id:'netflix',name:'Netflix'},{id:'prime',name:'Prime Video'},{id:'disney',name:'Disney+'},{id:'hulu',name:'Hulu'},{id:'max',name:'Max'},{id:'apple',name:'Apple TV'}];
export const initialSettings=()=>({people:[{genres:['Comedy','Mystery'],mood:'',favorite:''},{genres:['Adventure'],mood:'',favorite:''}],services:[],extras:false,runtime:999});
export function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function providerLabel(provider){if(provider.costNote)return String(provider.costNote);if(provider.extraCost||provider.addon)return 'Separate add-on subscription required';const kind=String(provider.type||provider.accessType||'').toLowerCase();return ({subscription:'Subscription required',flatrate:'Subscription required',included:'Subscription required',rent:'Rent · extra cost',rental:'Rent · extra cost',buy:'Buy · extra cost',purchase:'Buy · extra cost',free:'Free',ads:'Free with ads','ad-supported':'Free with ads',addon:'Separate add-on subscription required'})[kind]||'Check access and cost with provider';}
export function providerName(provider){return provider.name||provider.providerName||provider.service?.name||'Streaming provider';}
export function providersFor(title){return Array.isArray(title.matchedProviders)?title.matchedProviders:Array.isArray(title.providers)?title.providers:[];}

// Secure UUIDs also work in app webviews that lack randomUUID().
export function pickSearchId(cryptoApi=globalThis.crypto){
 if(typeof cryptoApi?.randomUUID==='function')return cryptoApi.randomUUID();
 const bytes=cryptoApi.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

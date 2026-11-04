// Website-only preference and display helpers. Recommendations come from the API.
export const genres=['Comedy','Mystery','Adventure','Romance','Sci-fi','Drama','Action','Animation'];
export const moods=['Fun','Cozy','Surprising','Intense'];
export const services=[{id:'netflix',name:'Netflix'},{id:'prime',name:'Prime Video'},{id:'disney',name:'Disney+'},{id:'hulu',name:'Hulu'},{id:'max',name:'Max'},{id:'apple',name:'Apple TV'}];
export const initialSettings=()=>({people:[{genres:['Comedy','Mystery'],mood:'Fun',favorite:''},{genres:['Adventure'],mood:'Cozy',favorite:''}],services:['netflix','prime','hulu'],extras:false,runtime:150});
export function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function providerLabel(provider){if(provider.costNote)return String(provider.costNote);if(provider.extraCost||provider.addon)return 'Separate add-on subscription required';const kind=String(provider.type||provider.accessType||'').toLowerCase();return ({subscription:'Subscription required',flatrate:'Subscription required',included:'Subscription required',rent:'Rent · extra cost',rental:'Rent · extra cost',buy:'Buy · extra cost',purchase:'Buy · extra cost',free:'Free',ads:'Free with ads','ad-supported':'Free with ads',addon:'Separate add-on subscription required'})[kind]||'Check access and cost with provider';}
export function providerName(provider){return provider.name||provider.providerName||provider.service?.name||'Streaming provider';}
export function providersFor(title){return Array.isArray(title.matchedProviders)?title.matchedProviders:Array.isArray(title.providers)?title.providers:[];}

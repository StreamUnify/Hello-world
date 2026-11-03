// Applied only while packaging the native apps. Website HTML stays unchanged.
const cardOffers='${renderProviderGroups(t)||';
const cardList='const list=pool.filter(t=>qualifying(t));';
export const nativeDiscoveryHelpers=`
function nativePrimaryProvider(t){return orderedProviders(t)[0];}
function nativeCardProvider(t){
 const p=nativePrimaryProvider(t);if(!p)return '';
 return '<span class="provider su-native-primary-provider">'+(hasSelectedAccess(p)?'✓ ':'')+esc(providerDisplayName(p))+' '+label(p)+(providerAccessText(p)?'<span class="provider-access">'+esc(providerAccessText(p))+'</span>':'')+'</span>';
}
function nativeDiscoveryTitles(list){
 // Keep all searches, filters, and watchlist results; only trim default Discover.
 if(filter!=='all'||searchContext||actorSearch||$('search').value.trim()||$('genreFilter').value||activeRating)return list;
 // The catalog is already in its source's trending/popularity order. Select
 // the highest-ranked title per primary provider before filling spare slots.
 const candidates=[],seenTitles=new Set();
 for(const t of list){if(seenTitles.has(String(t.id)))continue;seenTitles.add(String(t.id));const p=nativePrimaryProvider(t);if(p)candidates.push({title:t,provider:providerHost(p).id});}
 const chosen=new Set(),providers=new Set();
 for(const item of candidates){if(!providers.has(item.provider)){chosen.add(item.title);providers.add(item.provider);}if(chosen.size===4)break;}
 for(const item of candidates){if(chosen.size===4)break;chosen.add(item.title);}
 return candidates.filter(item=>chosen.has(item.title)).map(item=>item.title);
}
`;
export const nativeDiscoveryStyle='<style id="su-native-discovery">#results .su-native-primary-provider{display:block;width:100%;min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.45}#results .su-native-primary-provider .price-label{display:inline-block;margin:4px 0 0}#results .providers{min-width:0}#results .content{min-width:0}</style>';
function replaceOnce(html,needle,replacement){
 if(html.split(needle).length!==2)throw Error('Native discovery packaging anchor must occur exactly once: '+needle);
 return html.replace(needle,replacement);
}
export function nativeDiscoveryHtml(html){
 let result=replaceOnce(html,cardOffers,'${nativeCardProvider(t)||');
 result=replaceOnce(result,cardList,'const list=nativeDiscoveryTitles(pool.filter(t=>qualifying(t)));');
 result=replaceOnce(result,'function resultTitle(t){',nativeDiscoveryHelpers+'function resultTitle(t){');
 return replaceOnce(result,'</head>',nativeDiscoveryStyle+'</head>');
}

// These are provider websites already used by the shared catalog, not a claim
// that their Xbox apps support links. The native host discovers that at runtime.
export const providerSites=[
 ['Netflix','netflix.com'],['Prime Video','primevideo.com'],['Disney+','disneyplus.com'],
 ['Hulu','hulu.com'],['HBO Max','hbomax.com','max.com'],['Paramount+','paramountplus.com'],
 ['Peacock','peacocktv.com'],['Apple TV','tv.apple.com'],['Tubi','tubitv.com'],
 ['Pluto TV','pluto.tv'],['Plex','plex.tv'],['Crunchyroll','crunchyroll.com'],
 ['YouTube','youtube.com'],['Fandango at Home','vudu.com','athome.fandango.com'],
 ['Discovery+','discoveryplus.com'],['AMC+','amcplus.com'],['MGM+','mgmplus.com'],
 ['STARZ','starz.com'],['MUBI','mubi.com'],['BritBox','britbox.com'],['Shudder','shudder.com'],
 ['The Roku Channel','therokuchannel.roku.com'],['Sling','sling.com'],['fubo','fubo.tv']
];
export const providerHosts=providerSites.flatMap(([, ...hosts])=>hosts);
export function providerForUrl(value){
 try{
  if(typeof value!=='string'||value.length>4096||/[\s\\]/.test(value))return null;
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))return null;
  const site=providerSites.find(([, ...hosts])=>hosts.some(host=>url.hostname===host||url.hostname.endsWith('.'+host)));
  return site?{name:site[0],url:url.href,home:'https://'+site[1]+'/'}:null;
 }catch{return null;}
}

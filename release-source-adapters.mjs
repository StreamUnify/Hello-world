// Official editorial announcements, not theatrical release dates or playback guarantees.
// Country scope must be stated in the article; browser locale is not evidence of rights.
import {createHash} from 'node:crypto';

const MAX_BYTES=3*1024*1024, TIMEOUT_MS=8000;
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const AMAZON_INDEX='https://www.aboutamazon.com/news/entertainment';
const AMAZON_RSS='https://www.aboutamazon.com/rss/feed.rss';
const NETFLIX_MONTHLY='https://www.netflix.com/tudum/articles/new-on-netflix';
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function decode(value){return String(value||'').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(all,key)=>{if(key[0]==='#'){const cp=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return cp>0&&cp<=0x10ffff?String.fromCodePoint(cp):'';}return Object.hasOwn(entities,key)?entities[key]:all;});}
function allowedUrl(value){
 let u;try{u=new URL(value);}catch{throw Error('invalid_source_url');}
 if(u.protocol!=='https:'||u.port||u.username||u.password)throw Error('invalid_source_url');
 const allowed=u.hostname==='www.aboutamazon.com'&&(u.pathname==='/rss/feed.rss'||u.pathname==='/news/entertainment'||u.pathname.startsWith('/news/entertainment/'))||u.hostname==='www.netflix.com'&&u.pathname.startsWith('/tudum/articles/');
 if(!allowed)throw Error('untrusted_source_url');return u.href;
}
async function fetchText(fetcher,input){
 const controller=new AbortController();let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('source_timeout'));},TIMEOUT_MS);});
 const work=(async()=>{
  let url=allowedUrl(input);
  for(let redirects=0;redirects<=3;redirects++){
   const response=await fetcher(url,{redirect:'manual',credentials:'omit',signal:controller.signal,headers:{Accept:'text/html,application/rss+xml,application/xml'}});
   if(response.url)allowedUrl(response.url);
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw Error('invalid_redirect');url=allowedUrl(new URL(location,url).href);continue;}
   if(!response.ok)throw Error('source_unavailable');
   if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('source_too_large');
   let bytes=0,text='';const decoder=new TextDecoder();
   if(!response.body?.getReader)throw Error('source_body_unavailable');
   const reader=response.body.getReader();
   try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw Error('source_too_large');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
   return {html:text,url};
  }
  throw Error('too_many_redirects');
 })();
 try{return await Promise.race([work,timeout]);}finally{clearTimeout(timer);controller.abort();}
}
// Small inert HTML reader: never executes scripts, styles or source-supplied code.
function documentNodes(html){
 const root={tag:'root',attrs:{},children:[]},stack=[root];
 const source=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 for(const match of source.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)){
  const token=match[0];if(token.startsWith('<!--')||token.startsWith('<!'))continue;
  if(token.startsWith('</')){const tag=token.match(/^<\/\s*([\w-]+)/)?.[1]?.toLowerCase();for(let i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;break;}continue;}
  if(token.startsWith('<')){const tag=token.match(/^<\s*([\w-]+)/)?.[1]?.toLowerCase();if(!tag)continue;const attrs=Object.create(null);for(const a of token.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[a[1].toLowerCase()]=decode(a[2]??a[3]??a[4]);const node={tag,attrs,children:[]};stack.at(-1).children.push(node);if(!/\/$/.test(token.slice(0,-1))&&!['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(tag))stack.push(node);continue;}
  stack.at(-1).children.push(decode(token));
 }
 return root;
}
const text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join(' ').replace(/\s+/g,' ').trim();
function descendants(node,predicate){const found=[];function walk(n){if(typeof n==='string')return;if(predicate(n))found.push(n);for(const child of n.children||[])walk(child);}walk(node);return found;}
const first=(root,tag)=>descendants(root,n=>n.tag===tag)[0];
function hasUSScope(root){return /(?:coming|available|releases|stream(?:ing)?|titles|lineup)[^.]{0,180}\b(?:United States|U\.S\.)\b/i.test(text(root));}
function articlePeriod(root){const heading=text(first(root,'h1'));const match=heading.match(new RegExp('\\b('+MONTHS.join('|')+')\\s+(20\\d{2})\\b','i'));return match?{month:MONTHS.findIndex(m=>m.toLowerCase()===match[1].toLowerCase()),year:Number(match[2])}:null;}
function dateFor(month,day,year){const d=new Date(Date.UTC(year,month,day));return d.getUTCFullYear()===year&&d.getUTCMonth()===month&&d.getUTCDate()===day?d.toISOString().slice(0,10):null;}
function releaseWindow(now){const day=Math.floor(now/86400000)*86400000;return {start:day-13*86400000,end:day+30*86400000};}
function inWindow(date,now){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;const {start,end}=releaseWindow(now),t=Date.parse(date+'T00:00:00Z');return t>=start&&t<=end;}
function periodOverlaps(period,now){const {start,end}=releaseWindow(now),first=Date.UTC(period.year,period.month,1),last=Date.UTC(period.year,period.month+1,1)-1;return first<=end&&last>=start;}

function trustedImage(value,provider){try{const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password)return null;if(provider==='prime'&&u.hostname==='assets.aboutamazon.com'||provider==='netflix'&&u.hostname==='dnm.nflximg.net')return u.href;}catch{}return null;}
function release({title,provider,date,image,url,now}){
 title=title.replace(/^[‘“'"](.+?)[’”'"](?=\s|$)/,'$1').replace(/^[‘’“”'"\s]+|[‘’“”'"\s]+$/g,'').trim();
 if(!title||title.length>220||!inWindow(date,now)||!image)return null;
 const providerName=provider==='prime'?'Prime Video':'Netflix';
 return {id:'official:'+createHash('sha256').update([provider,'US',title,date].join('|')).digest('hex').slice(0,24),title,provider,providerName,streamingDate:date,countries:['US'],image,description:`Announced for ${providerName} in the United States. Check the provider for current availability.`,sourceUrl:url,verifiedAt:new Date(now).toISOString()};
}
export function parsePrimeAnnouncements(html,{url,now=Date.now()}={}){
 allowedUrl(url);const root=documentNodes(html),article=descendants(root,n=>n.tag==='div'&&n.attrs.class?.split(/\s+/).includes('ArticlePage-articleBody'))[0];
 if(!article||!hasUSScope(article))return [];
 const period=articlePeriod(root);if(!period||!periodOverlaps(period,now))return [];
 // Only image-bearing title spotlights before the sports/full-list sections qualify.
 const nodes=descendants(article,n=>['h2','h3','img'].includes(n.tag)||n.attrs.class?.split(/\s+/).includes('contentItem-role-text'));
 const releases=[];let section='',pending=null;
 const flush=()=>{if(!pending)return;const r=release({...pending,provider:'prime',url,now});if(r)releases.push(r);pending=null;};
 for(const node of nodes){
  if(node.tag==='h2'){flush();section=text(node);continue;}
  if(node.tag==='h3'){flush();if(/(?:originals|new (?:movies|shows)|spotlight)/i.test(section)&&!/(?:sports|rent|buy|channel)/i.test(section))pending={title:text(node),date:null,image:null};continue;}
  if(!pending)continue;
  if(node.tag==='img'&&!pending.image)pending.image=trustedImage(node.attrs.src,'prime');
  else if(node.tag!=='img'&&!pending.date){const value=text(node),m=value.match(new RegExp('^('+MONTHS.join('|')+')\\s+(\\d{1,2})\\b','i'));if(m){const month=MONTHS.findIndex(x=>x.toLowerCase()===m[1].toLowerCase());if(month===period.month)pending.date=dateFor(month,Number(m[2]),period.year);}}
 }
 flush();return releases;
}
export function parseNetflixAnnouncements(html,{url=NETFLIX_MONTHLY,now=Date.now()}={}){
 allowedUrl(url);
 // Disabled until both regional scope and a streaming-specific date contract are
 // verified. A generic card/time or NewsArticle date may be publication metadata;
 // requestCountry/page language likewise does not establish territorial rights.
 return [];
}
function discoverPrime(indexHtml,rssHtml,now){
 const candidates=new Map();
 for(const n of descendants(documentNodes(indexHtml),n=>n.tag==='a'&&n.attrs.href)){try{const url=allowedUrl(new URL(n.attrs.href,AMAZON_INDEX).href);candidates.set(url,text(n)+' '+url);}catch{}}
 for(const item of rssHtml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){const link=decode(item[1].match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,'').trim());try{const url=allowedUrl(link);candidates.set(url,item[1]);}catch{}}
 const {start,end}=releaseWindow(now),cursor=new Date(start),allowedMonths=[];cursor.setUTCDate(1);while(cursor.getTime()<=end){allowedMonths.push(MONTHS[cursor.getUTCMonth()].toLowerCase());cursor.setUTCMonth(cursor.getUTCMonth()+1);}
 return [...candidates].filter(([url,label])=>url.startsWith(AMAZON_INDEX+'/')&&(/(?:what[^.]{0,12}new|new on)\s+(?:on\s+)?prime\s+video/i.test(label)||new RegExp('prime-video-(?:'+MONTHS.join('|')+')','i').test(url))&&allowedMonths.some(m=>label.toLowerCase().includes(m))).slice(0,3).map(([url])=>url);
}
export async function collectOfficialReleases({fetcher=fetch,now=Date.now()}={}){
 now=typeof now==='function'?now():now;if(!Number.isFinite(now))throw Error('invalid_clock');
 const result={releases:[],sources:{netflix:'unavailable',prime:'unavailable'}};
 await Promise.all([
  (async()=>{try{const page=await fetchText(fetcher,NETFLIX_MONTHLY),items=parseNetflixAnnouncements(page.html,{url:page.url,now});if(items.length){result.releases.push(...items);result.sources.netflix='ok';}}catch{}})(),
  (async()=>{const discovery=await Promise.allSettled([fetchText(fetcher,AMAZON_INDEX),fetchText(fetcher,AMAZON_RSS)]);const html=i=>discovery[i].status==='fulfilled'?discovery[i].value.html:'';const urls=discoverPrime(html(0),html(1),now);await Promise.all(urls.map(async url=>{try{const page=await fetchText(fetcher,url),items=parsePrimeAnnouncements(page.html,{url:page.url,now});if(items.length){result.releases.push(...items);result.sources.prime='ok';}}catch{}}));})()
 ]);
 result.releases=[...new Map(result.releases.map(item=>[item.id,item])).values()].sort((a,b)=>a.streamingDate.localeCompare(b.streamingDate)||a.title.localeCompare(b.title));return result;
}

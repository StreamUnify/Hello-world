// Isolated UI preview: no production credentials, real accounts or alert writes.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const titles=JSON.parse(await readFile(new URL('./feature-preview-titles.json',import.meta.url)));
const out=new URL('../feature-preview/',import.meta.url);await mkdir(out,{recursive:true});
const mock=`(()=>{
 const titles=${JSON.stringify(titles)};
 const load=()=>JSON.parse(localStorage.getItem('su_preview_alerts')||'{}');
 const write=x=>localStorage.setItem('su_preview_alerts',JSON.stringify(x));
 window.StreamUnifyMembership={enabled:true,premium:true,status:{plan:'premium'},show(){},
 async watchlist(){return [];},async save(){},
 async search(url){const u=new URL(url,location.origin);const q=(u.searchParams.get('q')||'').toLowerCase(),rating=u.searchParams.get('rating');return {results:titles.filter(t=>(!q||t.name.toLowerCase().includes(q))&&(!rating||t.contentRating===rating)),sources:{tmdb:'ok'}};},
 async api(url,options={}){const u=new URL(url,location.origin),data=options.body?JSON.parse(options.body):{},items=load();
 if(u.pathname==='/api/availability-alerts'){
 if(options.method==='POST'){items[String(data.title.id)]={title_id:String(data.title.id),snapshot:data.title};write(items);return {availableNow:[]};}
 if(options.method==='DELETE'){delete items[u.searchParams.get('id')];write(items);return {ok:true};}
 return {alerts:Object.values(items),notifications:[]};}
 if(u.pathname.includes('/api/availability-alerts/'))return {ok:true};
 if(u.pathname==='/api/details')return {title:titles.find(t=>String(t.sourceId)===u.searchParams.get('id')),availability:'ok'};
 if(u.pathname==='/api/movie-order')return {release:[],chronological:null};
 return {};}};
 window.membershipReady=Promise.resolve();
})();`;
let html=await readFile(new URL('../index.html',import.meta.url),'utf8');
html=html.replace('<script src="app-config.js"></script>','')
 .replace('<script src="/membership-client.js"></script>','<script>'+mock+'</script>')
 .replace(/<script defer src="\/(?:analytics-config|website-analytics)\.js"><\/script>/g,'')
 .replace('</body>','<div style="position:fixed;bottom:0;left:0;right:0;padding:8px;background:#f7cf53;color:#172036;text-align:center;z-index:1000;font:600 13px sans-serif">UI PREVIEW · sample titles · simulated alerts · no real account changes</div></body>');
await writeFile(new URL('index.html',out),html);
for(const name of ['availability-client.js','streamunify-header.png','streamunify-seamless-artwork.png','streamunify-logo.jpg'])await copyFile(new URL('../'+name,import.meta.url),new URL(name,out));
console.log('Built isolated rating and alert interface preview.');

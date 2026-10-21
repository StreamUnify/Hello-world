import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const token=process.env.TMDB_READ_ACCESS_TOKEN;
const key=process.env.TMDB_API_KEY;
const countries=new Set(['US','CA','GB','AU','NZ','IN','FR','DE','ES','IT','AT','BR','MX','AR','CO','KR','JP','SG','MY','PH','ID','AE','SA','ZA','NG']);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=120'});res.end(JSON.stringify(data))};
async function tmdb(endpoint,params={}){if(!token&&!key)throw new Error('Server requires TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY');const url=new URL('https://api.themoviedb.org/3/'+endpoint);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);if(!token)url.searchParams.set('api_key',key);const r=await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}: {},signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('TMDB returned HTTP '+r.status);return r.json()}
async function buildResults(items,country){const limited=items.filter(x=>(x.media_type==='movie'||x.media_type==='tv'||x.title||x.name)&&x.id).slice(0,18);return Promise.all(limited.map(async x=>{const type=x.media_type==='tv'||(!x.title&&x.name)?'series':'movie';const kind=type==='movie'?'movie':'tv';let providers=[],watchUrl='';try{const w=await tmdb(`${kind}/${x.id}/watch/providers`);const region=w.results?.[country];watchUrl=region?.link||'';for(const [field,label] of [['free','FREE'],['ads','FREE WITH ADS'],['flatrate','SUBSCRIPTION'],['rent','RENT'],['buy','BUY']])for(const p of region?.[field]||[])if(!providers.some(v=>v.id===p.provider_id&&v.type===label))providers.push({id:p.provider_id,name:p.provider_name,type:label})}catch{}providers.sort((a,b)=>['FREE','FREE WITH ADS','SUBSCRIPTION','RENT','BUY'].indexOf(a.type)-['FREE','FREE WITH ADS','SUBSCRIPTION','RENT','BUY'].indexOf(b.type));return {id:x.id*10+(type==='series'?1:0),name:x.title||x.name,type,year:(x.release_date||x.first_air_date||'').slice(0,4),desc:x.overview||'',poster:x.poster_path?'https://image.tmdb.org/t/p/w500'+x.poster_path:null,providers,watchUrl}}))}
http.createServer(async(req,res)=>{try{
  // Capacitor's bundled web app uses these origins on iOS and Android.
  // This only permits public catalog endpoints; TMDB credentials remain server-side.
  const origin=req.headers.origin;
  const allowedOrigins=new Set(['capacitor://localhost','http://localhost','https://localhost']);
  if(origin&&allowedOrigins.has(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
  }
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const u=new URL(req.url,'http://localhost');if(u.pathname==='/api/search'||u.pathname==='/api/trending'){const country=countries.has(u.searchParams.get('country'))?u.searchParams.get('country'):'US';const q=(u.searchParams.get('q')||'').trim().slice(0,120);const data=u.pathname==='/api/search'&&q?await tmdb('search/multi',{query:q,include_adult:'false',language:'en-US',page:'1'}):await tmdb('trending/all/week',{language:'en-US'});return json(res,200,{results:await buildResults(data.results||[],country),country})}if(u.pathname==='/'||u.pathname==='/index.html'){const html=await readFile(path.join(root,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return}json(res,404,{error:'Not found'})}catch(e){console.error('Request failed:',e);if(res.headersSent){if(!res.writableEnded)res.end();}else{json(res,503,{error:'Server request failed. Check Render logs.'})}}}).listen(port,()=>console.log(`StreamUnify at http://localhost:${port}`));

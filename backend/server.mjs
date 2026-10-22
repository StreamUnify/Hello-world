import http from 'node:http';
import {createCatalog} from './catalog.mjs';
const catalog=createCatalog();
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const countries=new Set(['US','CA','GB','AU','NZ','IN','FR','DE','ES','IT','AT','BR','MX','AR','CO','KR','JP','SG','MY','PH','ID','AE','SA','ZA','NG']);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=120','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(data))};
http.createServer(async(req,res)=>{try{if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS'});return res.end()}if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});const u=new URL(req.url,'http://localhost');if(u.pathname==='/api/search'||u.pathname==='/api/trending'){const country=countries.has(u.searchParams.get('country'))?u.searchParams.get('country'):'US';const q=(u.searchParams.get('q')||'').trim().slice(0,120);const data=await catalog.search(u.pathname==='/api/search'?q:'',country);return json(res,200,data)}if(u.pathname==='/streamunify-seamless-artwork.png'){
const img=await readFile(path.join(root,'streamunify-seamless-artwork.png'));
res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'});
res.end(img);
return}
if(u.pathname==='/streamunify-header.png'){const img=await readFile(path.join(root,'streamunify-header.png'));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'});res.end(img);return}if(u.pathname==='/app-config.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});res.end("window.STREAMUNIFY_API_BASE = '';");return}if(u.pathname==='/'||u.pathname==='/index.html'){const html=await readFile(path.join(root,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return}json(res,404,{error:'Not found'})}catch(e){console.error('Request failed');if(res.headersSent){if(!res.writableEnded)res.end();}else{json(res,503,{error:'Server request failed. Check Render logs.'})}}}).listen(port,()=>console.log(`StreamUnify at http://localhost:${port}`));

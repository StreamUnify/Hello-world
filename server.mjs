import http from 'node:http';
import {createCatalog} from './catalog.mjs';
const catalog=createCatalog();
import {createMembership} from './membership.mjs';
import {restrictCatalog,MembershipError} from './membership-policy.mjs';
import {createAccountRoutes} from './account-routes.mjs';
import {createBilling} from './billing.mjs';
const membership=createMembership();
const billing=createBilling();
const accountRoutes=createAccountRoutes(membership,billing);
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const countries=new Set(['US','CA','GB','AU','NZ','IN','FR','DE','ES','IT','AT','BR','MX','AR','CO','KR','JP','SG','MY','PH','ID','AE','SA','ZA','NG']);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(data))};
const server=http.createServer(async(req,res)=>{try{if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Search-Id'});return res.end()}const u=new URL(req.url,'http://localhost');if(await accountRoutes(req,res,u,json))return;if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});if(u.pathname==='/membership-client.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(path.join(root,'membership-client.js')));return;}if(u.pathname==='/analytics-config.js'){const value=(process.env.GA4_MEASUREMENT_ID??'G-9FW1KRWQT7').trim();const measurementId=/^G-[A-Z0-9]{5,20}$/.test(value)?value:null;res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end('window.STREAMUNIFY_ANALYTICS = '+JSON.stringify({measurementId})+';');return}if(u.pathname==='/website-analytics.js'){const script=await readFile(path.join(root,'website-analytics.js'));res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(script);return}if(u.pathname==='/api/search'||u.pathname==='/api/trending'){let country=countries.has(u.searchParams.get('country'))?u.searchParams.get('country'):'US';const q=(u.searchParams.get('q')||'').trim().slice(0,120);let actor,status;const searching=u.pathname==='/api/search'&&q;
if(membership.enabled){if(req.headers.authorization){actor=await membership.authenticate(req);status=await membership.status(actor);}if(searching&&!actor)throw new MembershipError(401,'sign_in_required','Sign in to use your 10 free monthly searches');if(status?.plan!=='premium')country='US';}
const data=await catalog.search(searching?q:'',country);
if(membership.enabled){if(searching){if(!Object.values(data.sources||{}).includes('ok'))throw new MembershipError(503,'catalog_unavailable','Search is temporarily unavailable. Your allowance was not used.');status=await membership.consumeSearch(actor,req.headers['x-search-id'],country+':'+q.toLowerCase());}data.results=restrictCatalog(data.results,status);data.membership=status||{plan:'free',remaining:10,watchlist:false};}
return json(res,200,data)}if(u.pathname==='/streamunify-seamless-artwork.png'){
const img=await readFile(path.join(root,'streamunify-seamless-artwork.png'));
res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'});
res.end(img);
return}
if(u.pathname==='/streamunify-header.png'){const img=await readFile(path.join(root,'streamunify-header.png'));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'});res.end(img);return}if(u.pathname==='/app-config.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});res.end("window.STREAMUNIFY_API_BASE = '';");return}if(u.pathname==='/'||u.pathname==='/index.html'){const html=await readFile(path.join(root,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return}json(res,404,{error:'Not found'})}catch(e){console.error('Request failed');if(res.headersSent){if(!res.writableEnded)res.end();}else{json(res,e instanceof MembershipError?e.status:503,{error:e instanceof MembershipError?e.message:'Server request failed. Please try again.',code:e.code,membership:e.membership})}}}).listen(port,()=>console.log(`StreamUnify at http://localhost:${port}`));

export {server};

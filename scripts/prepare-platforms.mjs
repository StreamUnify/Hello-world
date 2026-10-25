import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await readFile(path.join(root,'mobile.config.json'),'utf8'));
const apiBase=new URL(process.env.STREAMUNIFY_API_BASE || config.apiBase);
if(apiBase.protocol!=='https:' || apiBase.username || apiBase.password || apiBase.search || apiBase.hash || apiBase.pathname!=='/')throw Error('Mobile API base must be an HTTPS origin without credentials, query, or path');
const html=await readFile(path.join(root,'index.html'),'utf8');
const mobileStyle=`<style id="su-mobile-safe-areas">
.su-header{padding-top:calc(8px + env(safe-area-inset-top));padding-left:max(12px,env(safe-area-inset-left));padding-right:max(12px,env(safe-area-inset-right));}
.su-drawer{padding-top:calc(22px + env(safe-area-inset-top));padding-bottom:calc(22px + env(safe-area-inset-bottom));}
.modalback{padding:12px;padding-top:max(12px,env(safe-area-inset-top));padding-bottom:max(12px,env(safe-area-inset-bottom));}
.modal{max-height:calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom));}
main{padding-bottom:max(80px,env(safe-area-inset-bottom));padding-left:max(24px,env(safe-area-inset-left));padding-right:max(24px,env(safe-area-inset-right));}
</style>`;
for(const dir of ['www','backend'])await mkdir(path.join(root,dir),{recursive:true});
await writeFile(path.join(root,'www/index.html'),html.replace('</head>',mobileStyle+'</head>'));
await writeFile(path.join(root,'www/app-config.js'),'window.STREAMUNIFY_API_BASE = '+JSON.stringify(apiBase.origin)+';\n');
for(const name of ['streamunify-header.png','streamunify-seamless-artwork.png','streamunify-logo.jpg']){
 for(const dir of ['www','backend'])await copyFile(path.join(root,name),path.join(root,dir,name));
}
const serverFiles=['index.html','server.mjs','seo-routes.mjs','catalog.mjs','title-index.mjs','title-index-worker.mjs','search-title-index.json','movie-order.mjs','membership.mjs','membership-policy.mjs','account-routes.mjs','billing.mjs','store-billing.mjs','store-policy.mjs','legal-pages.mjs','membership-client.js','website-analytics.js'];
for(const name of serverFiles)await copyFile(path.join(root,name),path.join(root,'backend',name));
for(const name of ['membership-client.js','website-analytics.js'])await copyFile(path.join(root,name),path.join(root,'www',name));
await writeFile(path.join(root,'www/analytics-config.js'),'window.STREAMUNIFY_ANALYTICS = {measurementId:null};\n');
await mkdir(path.join(root,'backend/certs'),{recursive:true});
await copyFile(path.join(root,'certs/AppleRootCA-G3.pem'),path.join(root,'backend/certs/AppleRootCA-G3.pem'));
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const dependencies=Object.fromEntries(['@supabase/supabase-js','stripe','@apple/app-store-server-library','google-auth-library'].map(name=>[name,pkg.dependencies[name]]));
await writeFile(path.join(root,'backend/package.json'),JSON.stringify({name:'streamunify-backend',version:pkg.version,private:true,type:'module',scripts:{start:'node server.mjs'},dependencies,engines:{node:'>=22'}},null,2)+'\n');
console.log('Prepared website backend and shared iOS/Android web assets. API: '+apiBase.origin);

// Isolated preview of the production interface. No live Auth, billing or catalog calls.
import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {websiteHtml} from '../website-branding.mjs';
const out=new URL('../free-launch-preview/',import.meta.url);await mkdir(out,{recursive:true});
const auth=`export function createClient(){
 const listeners=[];const session=()=>window.previewUser?{user:window.previewUser,access_token:'preview-only'}:null;
 window.previewSignIn=()=>{window.previewUser={id:'preview-only',email_confirmed_at:new Date().toISOString(),user_metadata:{}};listeners.forEach(fn=>fn('SIGNED_IN'));};
 return {auth:{async getSession(){return {data:{session:session()}};},async getUser(){return {data:{user:window.previewUser}};},onAuthStateChange(fn){listeners.push(fn);},async signInWithPassword(){window.previewSignIn();return {error:null};},async signInWithOtp(){return {error:null};},async updateUser(){return {error:null};},async signOut(){window.previewUser=null;return {error:null};}}};
}`;
await build({entryPoints:['membership-client-src.js'],bundle:true,format:'iife',outfile:new URL('membership-client.js',out).pathname,plugins:[{name:'isolated-auth',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'auth',namespace:'preview'}));b.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:auth,loader:'js'}));}}]});
const snapshot=JSON.parse(await readFile('scripts/free-launch-catalog-snapshot.json','utf8'));
if(!snapshot.results?.length)throw Error('Refusing to build an empty catalog preview');
const previewScript=await build({stdin:{contents:`import {createPreviewFetch} from './scripts/free-launch-preview-api.mjs';window.STREAMUNIFY_ANALYTICS={measurementId:null};window.fetch=createPreviewFetch(${JSON.stringify(snapshot).replace(/</g,'\\u003c')},()=>window.previewUser,window.fetch.bind(window));`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',minify:true});
const bootstrap=`<meta name="robots" content="noindex,nofollow"><script>${previewScript.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`;
const toolbar=`<div style="position:fixed;bottom:12px;left:12px;z-index:100000;background:#10263d;color:white;padding:10px 14px;border:1px solid #32c4ff;border-radius:12px;font:13px system-ui;max-width:90vw">Preview only · Saved US catalog · No emails or payments. <button type="button" onclick="window.previewSignIn();window.membershipReady.then(()=>setTimeout(()=>window.StreamUnifyMembership.show(),100))" style="margin-left:8px;padding:6px 10px">Preview signed-in account</button></div>`;
let html=websiteHtml(await readFile('index.html','utf8'));
html=html.replace('<head>','<head>'+bootstrap).replace('</body>',toolbar+'</body>');
await writeFile(new URL('index.html',out),html);
for(const name of ['streamunify-header.png','streamunify-seamless-artwork.png','streamunify-logo.jpg','favicon.ico','favicon.png','provider-entitlements.js','availability-client.js','i18n-client.js','website-pick-together-model.mjs','website-pick-together-ui.mjs','website-pick-together.css'])await copyFile(name,new URL(name,out));
await writeFile(new URL('app-config.js',out),'window.STREAMUNIFY_API_BASE="";\n');
await writeFile(new URL('analytics-config.js',out),'window.STREAMUNIFY_ANALYTICS={measurementId:null};\n');
await writeFile(new URL('website-analytics.js',out),'// Analytics disabled in isolated preview.\n');
console.log('Built isolated free-launch homepage and account preview.');

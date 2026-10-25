import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {Script} from 'node:vm';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('shared web, backend and native inputs remain in sync',async()=>{
 execFileSync(process.execPath,['scripts/prepare-platforms.mjs']);
 const root=await read('index.html'),mobile=await read('www/index.html');
 assert.equal(mobile.replace(/<style id="su-mobile-safe-areas">[\s\S]*?<\/style>/,''),root);
 for(const file of ['server.mjs','catalog.mjs','title-index.mjs','title-index-worker.mjs','search-title-index.json','movie-order.mjs','index.html','account-routes.mjs','billing.mjs','membership.mjs','membership-policy.mjs','store-billing.mjs','store-policy.mjs','legal-pages.mjs','membership-client.js','website-analytics.js','certs/AppleRootCA-G3.pem'])assert.equal(await read('backend/'+file),await read(file));
 assert.match(await read('www/app-config.js'),/^window\.STREAMUNIFY_API_BASE = "https:\/\//);
 assert.match(mobile,/safe-area-inset-top/);
 assert.equal(JSON.parse(await read('capacitor.config.json')).webDir,'www');
 for(const html of [root,mobile])for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new Script(script[1]);
});

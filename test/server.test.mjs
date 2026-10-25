import {test} from 'node:test';
import assert from 'node:assert/strict';
import {watchPaths} from '../watch-pages.mjs';
import {createAccountRoutes} from '../account-routes.mjs';
test('signed webhook processing is available while customer accounts are disabled',async()=>{
  let received=false;let response;
  const route=createAccountRoutes({enabled:false},{async webhook(raw,signature){assert.equal(raw.toString(),'{}');assert.equal(signature,'signed-fixture');received=true;}});
  const req={method:'POST',headers:{'stripe-signature':'signed-fixture'},async *[Symbol.asyncIterator](){yield Buffer.from('{}');}};
  assert.equal(await route(req,{setHeader(){}},new URL('https://example.com/api/billing/webhook'),(_res,status,data)=>{response={status,data};}),true);
  assert.equal(received,true);assert.equal(response.status,200);
});
test('HTTP routes preserve public access while disabled and require accounts when enabled',async()=>{
  process.env.PORT='0';process.env.BILLING_ENABLED='false';process.env.TMDB_API_KEY='';process.env.WATCHMODE_API_KEY='';
  for(const enabled of [false,true]){
    process.env.MEMBERSHIP_ENABLED=String(enabled);
    process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
    const {server}=await import('../server.mjs?membership='+enabled);
    if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    try{
      const configResponse=await fetch(base+'/api/account/config');
      assert.equal(configResponse.headers.get('cache-control'),'no-store');
      const config=await configResponse.json();assert.equal(config.enabled,enabled);assert.equal(config.billingEnabled,false);
      assert.equal((await fetch(base+'/membership-client.js')).status,200);
      const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.match(robots.headers.get('content-type'),/text\/plain/);assert.match(await robots.text(),/Sitemap: https:\/\/www\.streamunify\.com\/sitemap\.xml/);
      const sitemap=await fetch(base+'/sitemap.xml');assert.equal(sitemap.status,200);assert.match(sitemap.headers.get('content-type'),/application\/xml/);const xml=await sitemap.text();assert.equal([...xml.matchAll(/<loc>/g)].length,4+watchPaths.length);assert.doesNotMatch(xml,/localhost|onrender|<lastmod>/);
      for(const pathname of ['/','/about','/privacy','/terms',...watchPaths]){const page=await fetch(base+pathname);assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('rel="canonical" href="https://www.streamunify.com'+pathname+'"'));}

      assert.equal((await fetch(base+'/where-to-watch/nonexistent')).status,404);
      assert.equal((await fetch(base+'/api/search?q=Title')).status,enabled?401:200);
      assert.equal((await fetch(base+'/api/watchlist')).status,enabled?401:503);
      assert.equal((await fetch(base+'/api/movie-order?id=invalid')).status,400);
      assert.equal((await fetch(base+'/api/movie-order?id=671')).status,enabled?401:503);
      const options=await fetch(base+'/api/watchlist',{method:'OPTIONS'});assert.match(options.headers.get('access-control-allow-headers'),/Authorization/);
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }
});

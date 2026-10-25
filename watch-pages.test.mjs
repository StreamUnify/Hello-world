import test from 'node:test';
import assert from 'node:assert/strict';
import {watchPage,watchPaths,watchTitles} from './watch-pages.mjs';
import {seoResponse} from './seo-routes.mjs';
test('every sitemap title has server-rendered unique content and canonical URL',()=>{
 const sitemap=seoResponse('/sitemap.xml').body;
 assert.equal(new Set(watchPaths).size,watchPaths.length);
 for(const path of watchPaths){const html=watchPage(path);assert.ok(html);assert.ok(sitemap.includes('https://www.streamunify.com'+path));assert.ok(html.includes('rel="canonical" href="https://www.streamunify.com'+path+'"'));}
 for(const t of watchTitles){const html=watchPage('/where-to-watch/'+t.slug);assert.ok(html.includes(t.description.replace(/&/g,'&amp;')));assert.ok(html.includes('/?q='+encodeURIComponent(t.name)));assert.ok(html.includes('10 searches'));assert.ok(html.includes('does not claim'));}
});
test('unknown paths are not indexed as duplicate title pages',()=>{
 assert.equal(watchPage('/where-to-watch/nonexistent'),null);
 assert.equal(watchPage('/where-to-watch/<script>'),null);
 assert.equal(watchPage('/random'),null);
});
test('title hub exposes ordinary crawlable links to all title guides',()=>{
 const html=watchPage('/where-to-watch');for(const t of watchTitles)assert.ok(html.includes('href="/where-to-watch/'+t.slug+'"'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('locale preference loads before membership and remains distinct from country',()=>{
 const html=read('index.html');
 assert.ok(html.indexOf('src="i18n-client.js"')<html.indexOf('src="/membership-client.js"'));
 assert.match(html,/read\('su_country',window.StreamUnifyI18n\?\.suggestedCountry\|\|'US'\)/);
 assert.match(html,/new URLSearchParams\(\{q:query,country,language:window.StreamUnifyI18n\?\.locale\|\|'en-US'\}\)/);
 assert.match(html,/id:tmdbId,country,language:window.StreamUnifyI18n/);
 assert.match(html,/movie-order.*language=.*StreamUnifyI18n/);
 const handler=html.slice(html.indexOf("window.addEventListener('su-languagechange'"),html.indexOf('// Prefill a title guide referral'));
 assert.doesNotMatch(handler,/loadTitles\(true|country\s*=|setItem\('su_country'/);
 assert.match(handler,/!\$\('search'\)\.value.trim\(\)/);
});
test('locale asset is served and packaged in every shared target',()=>{
 const prep=read('scripts/prepare-platforms.mjs');
 assert.equal((prep.match(/'i18n-client.js'/g)||[]).length,2);
 assert.match(read('server.mjs'),/u.pathname==='\/i18n-client.js'/);
});

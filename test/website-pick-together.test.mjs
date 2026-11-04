import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {websiteHtml} from '../website-branding.mjs';
import {initialSettings,providerLabel,safeUrl} from '../website-pick-together-model.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('real picker mounts on website only with one entry and no sample code',()=>{
 const root=read('index.html'),web=websiteHtml(root);
 assert.doesNotMatch(root,/suWebPickTogether|su-web-pick-together|website-pick-together/);
 assert.equal(web.match(/id="suWebPickTogether"/g).length,1);
 assert.equal(web.match(/id="suWebTogether"/g).length,1);
 assert.match(web,/class="su-together-title">Pick a Movie\. Together<\/span>/);
 assert.match(web,/type="module" src="website-pick-together-ui.mjs"/);
 assert.doesNotMatch(websiteHtml('<head><title>Legal</title></head><main>Legal</main>'),/suWebPickTogether/);
 for(const file of ['website-pick-together-ui.mjs','website-pick-together-model.mjs','website-pick-together.css'])assert.doesNotMatch(read(file),/sample|demo|fictional|preview|Game Night|Knives Out/i);
});
test('website backend companion files are exact and provider costs are honest',()=>{
 for(const file of ['website-branding.mjs','pick-together-service.mjs','website-pick-together-ui.mjs','website-pick-together-model.mjs','website-pick-together.css'])assert.equal(read(file),read('backend/'+file));
 assert.equal(safeUrl('javascript:alert(1)'), '');assert.equal(safeUrl('https://user:secret@example.org'), '');
 assert.equal(providerLabel({type:'Subscription',addon:{id:'addon:amazon:starz'},extraCost:true}),'Separate add-on subscription required');
 assert.equal(providerLabel({type:'Rent'}),'Rent · extra cost');assert.equal(providerLabel({type:'Ad-supported'}),'Free with ads');
 const one=initialSettings(),two=initialSettings();one.services.push('netflix');assert.notDeepEqual(one.services,two.services);
});

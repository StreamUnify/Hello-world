import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('search and collapsed services precede a separate full-width Discovery section',()=>{
 const search=html.indexOf('id="search"');
 const layout=html.indexOf('<div class="layout" id="discover">');
 const panel=html.indexOf('<details class="panel su-services-panel" id="suServicePanel">');
 const discovery=html.indexOf('<section class="su-discovery-content" aria-label="Discovery">');
 assert.ok(search>0&&search<layout&&layout<panel&&panel<discovery);
 assert.match(html.slice(panel,discovery),/^<details[^>]*><summary class="su-services-summary">/);
 assert.doesNotMatch(html.slice(panel,html.indexOf('>',panel)),/\bopen\b/);
 assert.ok(html.slice(panel,discovery).endsWith('</div></details>'));
 assert.doesNotMatch(html.slice(layout,discovery),/<aside\b/);
 assert.match(html,/\.layout\{display:flex!important;flex-direction:column;align-items:stretch/);
 assert.match(html,/\.layout>\.su-services-panel\{order:0;width:100%/);
 assert.match(html,/\.layout>\.su-discovery-content\{order:1;width:100%/);
});

test('collapsible service layout retains all controls and responsive keyboard access',()=>{
 for(const id of ['suServicePanel','serviceSearch','countryFilter','kindFilter','clearServices','serviceCount','services','addonServices','addonStatus','addonRetry']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/\.su-services-summary:focus-visible\{outline:/);
 assert.match(html,/\.su-services-body \.services\{[^}]*max-height:360px;overflow-y:auto/);
 assert.match(html,/@media\(max-width:600px\)[^]*?\.su-services-body \.services\{grid-template-columns:1fr/);
 assert.match(html,/\.provider-access\{[^}]*white-space:normal;overflow-wrap:anywhere/);
 assert.match(html,/\$\('suManageServices'\)\.onclick=\(\)=>\{\$\('suServicePanel'\)\.open=true/);
});

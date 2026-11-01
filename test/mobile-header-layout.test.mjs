import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=html.match(/<style id="su-mobile-header-layout">([^]*?)<\/style>/)[1];
test('mobile header overrides legacy flex shrink with isolated full-width action grid',()=>{
 assert.ok(html.indexOf('id="su-mobile-header-layout"')>html.indexOf('@media(max-width:1100px)'));
 assert.match(css,/@media\(max-width:1100px\)/);
 assert.match(css,/\.su-header\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
 assert.match(css,/\.su-header>\.su-discover\{grid-column:1\/-1;grid-row:3;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('dynamic language picker stays top-right and all actions support larger text and touch',()=>{
 const runtime=readFileSync(new URL('../i18n-client.js',import.meta.url),'utf8');
 assert.match(runtime,/wrap.className='su-language-picker'/);
 assert.match(css,/\.su-header>\.su-language-picker\{grid-column:1\/-1;grid-row:1;justify-self:end/);
 assert.match(css,/flex-wrap:wrap;max-width:100%;min-width:0/);
 assert.match(css,/\.su-action\{min-width:0;min-height:44px;width:100%;white-space:normal;overflow-wrap:anywhere/);
 assert.match(css,/env\(safe-area-inset-left\)/);
 assert.match(css,/env\(safe-area-inset-right\)/);
});

test('compact social links and pricing tracks shrink instead of forcing overflow',()=>{
 assert.match(css,/\.su-social-link\{min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere/);
 assert.match(css,/\.su-plans>\*\{min-width:0;overflow-wrap:anywhere/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});

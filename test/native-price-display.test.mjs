import test from 'node:test';import assert from 'node:assert/strict';
import {nativePlanText,nativeAnnualSavings} from '../native-price-display.mjs';
const products={monthly:{price:2.99,priceString:'$2.99',currencyCode:'USD'},annual:{price:30,priceString:'$30.00',currencyCode:'USD'}};
test('disabled store never implies prices will appear at checkout or invents website numbers',()=>{
 for(const interval of ['monthly','annual']){const text=nativePlanText(interval,{configLoaded:true,enabled:false,products});assert.match(text,/not enabled/);assert.doesNotMatch(text,/\$|See store pricing|16%/);}
});
test('loading, config failure, empty products and error states remain explicit and nonblank',()=>{
 assert.match(nativePlanText('monthly'),/Checking/);
 assert.match(nativePlanText('annual',{configLoaded:true}),/unavailable/);
 assert.match(nativePlanText('annual',{configLoaded:true,enabled:true}),/Loading/);
 for(const state of ['ready','unavailable'])assert.match(nativePlanText('annual',{configLoaded:true,enabled:true,state}),/temporarily unavailable/);
});
test('store localized price wins and annual savings are calculated from actual same-currency products',()=>{
 assert.match(nativePlanText('monthly',{configLoaded:true,enabled:true,state:'ready',products}),/\$2.99 \/ month/);
 const annual=nativePlanText('annual',{configLoaded:true,enabled:true,state:'ready',products});assert.match(annual,/\$30.00 \/ year/);assert.match(annual,/5.88/);assert.match(annual,/16%/);assert.match(annual,/35.88/);
 const euro={monthly:{priceString:'€3,49',price:3.49,currencyCode:'EUR'},annual:{priceString:'€29,99',price:29.99,currencyCode:'EUR'}};
 assert.match(nativePlanText('annual',{configLoaded:true,enabled:true,state:'ready',products:euro}),/€29,99/);assert.doesNotMatch(nativeAnnualSavings(euro),/16%/);
});
test('partial, malformed, mixed-currency and no-discount product data never invent annual savings',()=>{
 for(const value of [{},{monthly:products.monthly},{...products,annual:{...products.annual,currencyCode:'EUR'}},{...products,annual:{...products.annual,price:40}},{...products,monthly:{...products.monthly,price:NaN}}])assert.equal(nativeAnnualSavings(value),'');
});

test('homepage omits paid plan controls on web and native',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const file of ['index.html','backend/index.html','www/index.html']){
  const html=await readFile(new URL('../'+file,import.meta.url),'utf8');
  assert.doesNotMatch(html,/data-su-membership="(?:monthly|annual)"|data-su-store-price=/);
 }
});

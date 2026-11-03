// Presentation only: never substitute website prices for store-returned prices.
export function nativeAnnualSavings(products={}) {
 const monthly=products.monthly,annual=products.annual;
 if(!monthly?.currencyCode||monthly.currencyCode!==annual?.currencyCode)return '';
 const m=monthly.price,a=annual.price;
 if(!Number.isFinite(m)||!Number.isFinite(a)||m<=0||a<=0||a>=m*12)return '';
 const total=m*12,saving=total-a,percent=Math.round(saving/total*100);
 if(percent<1)return '';
 try{const currency=new Intl.NumberFormat(undefined,{style:'currency',currency:monthly.currencyCode});return `Save ${currency.format(saving)} (${percent}%) versus ${currency.format(total)} over 12 monthly payments.`;}catch{return '';}
}
export function nativePlanText(interval,{configLoaded=false,enabled,state='loading',products={}}={}) {
 if(!configLoaded)return 'Checking in-app pricing…';
 if(enabled===false)return 'In-app purchases are not enabled yet. No store price is currently available.';
 if(enabled!==true)return 'In-app pricing is unavailable. Please try again later.';
 const price=products[interval]?.priceString;
 if(state==='ready'&&typeof price==='string'&&price.trim()){
  const savings=interval==='annual'?nativeAnnualSavings(products):'';
  return `${price.trim()} / ${interval==='monthly'?'month':'year'} · Renews until canceled in your store.${savings?' '+savings:''}`;
 }
 return state==='loading'?'Loading store price…':'Store price is temporarily unavailable. Please try again later.';
}

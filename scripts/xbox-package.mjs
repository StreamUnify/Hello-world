import {websitePickerHtml} from '../website-branding.mjs';
const replaceOnce=(source,from,to)=>{
 if(source.split(from).length!==2)throw Error('Xbox packaging anchor changed: '+from.slice(0,80));
 return source.replace(from,to);
};
// Package the current shared interface. Xbox adaptations never modify its source.
export function xboxHtml(source){
 let html=websitePickerHtml(source);
 html=html.replace(/<script[^>]+src="\/?(?:analytics-config\.js|website-analytics\.js)"[^>]*><\/script>/g,'');
 html=replaceOnce(html,'  renderWatchOptions(details);',"  const pendingOrder=$('movieOrder');const keepOrder=pendingOrder?.querySelector('button')?.disabled||pendingOrder?.querySelector('button')?.hidden;renderWatchOptions(details);if(keepOrder&&$('movieOrder'))$('movieOrder').replaceWith(pendingOrder);");
 html=replaceOnce(html,'</head>','<link rel="stylesheet" href="xbox-tv.css"></head>');
 html=replaceOnce(html,'</body>','<script type="module" src="xbox-controls.js"></script></body>');
 return html;
}
export function xboxMembership(source){
 source=replaceOnce(source,"from './native-client.mjs'","from './xbox/web/auth-adapter.mjs'");
 source=replaceOnce(source,'const onDevice=native();','const onDevice=false;');
 source=replaceOnce(source,"const billingAvailable=native()?!!config?.stores?.[store]:!!config?.billingEnabled;",'const billingAvailable=false;');
 source=replaceOnce(source,"const signupRedirect=()=>native()?nativeRedirect:location.origin+'/';","const signupRedirect=()=>nativeRedirect;");
 source=replaceOnce(source,"if(!config.enabled)return;","if(!config.enabled)return;\n  config={...config,billingEnabled:false,stores:{}};");
 source=replaceOnce(source,"if(native())$('signupPricing').textContent='Premium includes unlimited searches, all supported providers, and your synced watchlist. Store pricing is shown after sign-in.';","$('signupPricing').textContent='Existing Premium memberships are recognized after sign-in. Purchases are not available in this Xbox preview.';");
 source=replaceOnce(source,"if(native())$('membershipPriceNote').textContent='Your store displays the subscription price and currency before purchase. Subscriptions renew until canceled in the original store. Streaming service subscriptions are separate.';","$('membershipPriceNote').textContent='Use your existing StreamUnify membership. Purchases and subscription management are not available in this Xbox preview. Provider subscriptions are separate.';");
 source=replaceOnce(source,"if(!window.confirm(","if(!await window.streamUnifyConfirm(");
 // Payment controls are both hidden and have no checkout/portal handlers.
 source=source.replace(/^dialog\.querySelectorAll\('\[data-plan\]'\)\.forEach\(b=>b\.onclick=.*$/m,"dialog.querySelectorAll('[data-plan]').forEach(b=>{b.hidden=true;b.onclick=()=>message('Purchases are unavailable on this Xbox preview.');});");
 source=source.replace(/^\$\('accountPortal'\)\.onclick=.*$/m,"$('accountPortal').onclick=()=>message('Manage your subscription in its original store.');");
 source=replaceOnce(source,"auth:{flowType:native()?'pkce':'implicit'","auth:{storageKey:'streamunify-xbox-auth',flowType:'implicit'");
 return source;
}

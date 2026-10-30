import {createHash} from 'node:crypto';
const allowed=new Set(['https://streamunify.com','https://www.streamunify.com','https://hello-world-1-qz8g.onrender.com','capacitor://localhost','http://localhost','https://localhost']);
export function createSecurity({now=Date.now,trustProxy=process.env.RENDER==='true',maxKeys=10000,trustedHtml=''}={}){
 const buckets=new Map();
 const hashes=[...trustedHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].filter(x=>x[1].trim()).map(x=>"'sha256-"+createHash('sha256').update(x[1]).digest('base64')+"'");
 return function secure(req,res){
  res.setHeader('Strict-Transport-Security','max-age=31536000');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(self)');
  const writeHead=res.writeHead;
  res.writeHead=function(status,headers){this.statusCode=status;for(const [key,value] of Object.entries(headers||{}))this.setHeader(key,value);return this;};
  const end=res.end.bind(res);res.end=(body,...args)=>{
   if(String(res.getHeader('Content-Type')).includes('text/html')&&body){
    res.setHeader('Content-Security-Policy',"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' "+hashes.join(' ')+" https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://nrhgzrarngqnlsrnvnla.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com; frame-src https://js.stripe.com https://hooks.stripe.com;"+((req.socket.encrypted||req.headers['x-forwarded-proto']==='https'||process.env.RENDER==='true')?' upgrade-insecure-requests':''));
   }res.writeHead=writeHead;return end(body,...args);
  };
  const origin=req.headers.origin;
  if(origin){res.setHeader('Vary','Origin');if(!allowed.has(origin)){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Origin not allowed'}));return false;}res.setHeader('Access-Control-Allow-Origin',origin);}
  if(req.url.startsWith('/api/')){
   const stamp=now();for(const [key,b]of buckets)if(b.until<=stamp)buckets.delete(key);
   const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
   const ip=trustProxy&&forwarded?forwarded:req.socket.remoteAddress;
   const group=/\/webhook|\/notifications/.test(req.url)?'webhook':/\/api\/(search|trending|details|movie-order)/.test(req.url)?'catalog':'account';
   const key=ip+':'+group,limit=group==='catalog'?60:group==='account'?120:300;
   let bucket=buckets.get(key);
   if(!bucket){if(buckets.size>=maxKeys){res.writeHead(503);res.end();return false;}bucket={count:0,until:stamp+60000};buckets.set(key,bucket);}
   if(++bucket.count>limit){res.setHeader('Retry-After',String(Math.ceil((bucket.until-stamp)/1000)));res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Too many requests. Please try again shortly.'}));return false;}
  }
  return true;
 };
}

import {MembershipError} from './membership-policy.mjs';

export async function readBody(req,limit=40000){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)throw new MembershipError(413,'too_large','Request is too large');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new MembershipError(400,'invalid_json','Invalid request');}
}
export function createAccountRoutes(membership,billing,stores){
  return async(req,res,u,json)=>{
    if(!u.pathname.startsWith('/api/account')&&!u.pathname.startsWith('/api/watchlist')&&!u.pathname.startsWith('/api/billing')&&!u.pathname.startsWith('/api/stores/'))return false;
    res.setHeader('Cache-Control','no-store');
    if(u.pathname==='/api/account/config'&&req.method==='GET'){json(res,200,{...membership.publicConfig(),billingEnabled:billing.enabled,stores:stores?.publicConfig()});return true;}
    if(u.pathname==='/api/stores/apple/notifications'&&req.method==='POST'&&stores){await stores.appleNotification(await readBody(req,150000));json(res,200,{received:true});return true;}
    if(u.pathname==='/api/stores/google/notifications'&&req.method==='POST'&&stores){await stores.googleNotification(await readBody(req,150000),req.headers.authorization);json(res,200,{received:true});return true;}
    if(u.pathname==='/api/billing/webhook'&&req.method==='POST'){
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1000000)throw new MembershipError(413,'too_large','Request too large');chunks.push(chunk);}
      await billing.webhook(Buffer.concat(chunks),req.headers['stripe-signature']);json(res,200,{received:true});return true;
    }
    if(!membership.enabled)throw new MembershipError(503,'membership_unavailable','Accounts are not available yet');
    const actor=await membership.authenticate(req);
    if(u.pathname==='/api/account'&&req.method==='GET'){await stores?.refreshActor(actor);json(res,200,await membership.status(actor));}
    else if(u.pathname==='/api/account/delete'&&req.method==='POST'){const body=await readBody(req);if(body.confirmation!=='DELETE')throw new MembershipError(400,'confirmation_required','Confirm account deletion');await membership.deleteAccount(actor);json(res,200,{deleted:true});}
    else if(u.pathname==='/api/stores/verify'&&req.method==='POST'&&stores){await stores.verify(actor,await readBody(req));json(res,200,await membership.status(actor));}
    else if(u.pathname==='/api/watchlist'&&req.method==='GET')json(res,200,{items:await membership.listWatchlist(actor)});
    else if(u.pathname==='/api/watchlist'&&req.method==='POST')json(res,200,{items:await membership.saveWatchlist(actor,await readBody(req))});
    else if(u.pathname==='/api/watchlist'&&req.method==='DELETE'){await membership.deleteWatchlist(actor,u.searchParams.get('id')||'');json(res,200,{ok:true});}
    else if(u.pathname==='/api/billing/checkout'&&req.method==='POST')json(res,200,await billing.checkout(actor,(await readBody(req)).interval));
    else if(u.pathname==='/api/billing/portal'&&req.method==='POST')json(res,200,await billing.portal(actor));
    else json(res,405,{error:'Method not allowed'});
    return true;
  };
}

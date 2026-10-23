import {MEMBERSHIP_PRICES,FREE_PROVIDERS,MembershipError,cleanWatchlistItem} from './membership-policy.mjs';

// No service-role or Stripe credentials are used here. Every database request
// carries the user's verified access token and remains subject to database RLS.
export function createMembership({env=process.env,fetcher=fetch}={}) {
  const enabled=env.MEMBERSHIP_ENABLED==='true';
  let origin='';
  try {const u=new URL(env.SUPABASE_URL);if(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/')origin=u.origin;}catch{}
  const key=env.SUPABASE_PUBLISHABLE_KEY||'';
  const configured=!!(origin&&key.startsWith('sb_publishable_'));
  if(enabled&&!configured)throw Error('Membership requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
  async function request(path,token,{method='GET',body,headers={}}={}) {
    let res;
    try {res=await fetcher(origin+path,{method,headers:{apikey:key,Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});}catch{throw new MembershipError(503,'account_unavailable','Account service is temporarily unavailable');}
    const data=await res.json().catch(()=>null);
    if(!res.ok){if(res.status===401)throw new MembershipError(401,'sign_in_required','Please sign in');if(res.status===403||data?.code==='42501')throw new MembershipError(403,'access_denied','Access requires a verified account and appropriate membership');throw new MembershipError(503,'account_unavailable','Account service is temporarily unavailable');}
    return data;
  }
  async function authenticate(req) {
    const header=req.headers?.authorization||'';
    const match=/^Bearer ([^\s]{20,8192})$/.exec(header);
    if(!match)throw new MembershipError(401,'sign_in_required','Please sign in');
    const user=await request('/auth/v1/user',match[1]);
    if(!user?.id||!user.email_confirmed_at||user.is_anonymous)throw new MembershipError(403,'verify_email','Verify your email before continuing');
    return {id:user.id,email:user.email,token:match[1]};
  }
  const rpc=(actor,name)=>request('/rest/v1/rpc/'+name,actor.token,{method:'POST',body:{}});
  async function premium(actor){const status=await rpc(actor,'membership_status');if(status?.plan!=='premium')throw new MembershipError(403,'premium_required','Upgrade to Premium to use your watchlist');}
  return {
    enabled,configured,
    publicConfig:()=>({enabled:enabled&&configured,...(enabled&&configured?{supabaseUrl:origin,publishableKey:key,prices:MEMBERSHIP_PRICES,freeProviders:FREE_PROVIDERS}:{})}),
    authenticate,
    status:actor=>rpc(actor,'membership_status'),
    async consumeSearch(actor,requestId,query){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId||''))throw new MembershipError(400,'invalid_search','Please submit a new search');const status=await request('/rest/v1/rpc/consume_search_once',actor.token,{method:'POST',body:{p_request_id:requestId,p_query:query}});if(!status?.allowed){const error=new MembershipError(429,'search_limit','Your 10 free searches are used. Upgrade or wait until your reset date.');error.membership=status;throw error;}return status;},
    async listWatchlist(actor){await premium(actor);const items=[];for(let offset=0;;offset+=500){const page=await request('/rest/v1/watchlist_items?select=title_id,snapshot,saved_at&order=saved_at.desc,title_id.asc&limit=500&offset='+offset,actor.token);items.push(...page);if(page.length<500)return items;}},
    async saveWatchlist(actor,input){await premium(actor);const snapshot=cleanWatchlistItem(input);return request('/rest/v1/watchlist_items?on_conflict=user_id,title_id',actor.token,{method:'POST',body:{user_id:actor.id,title_id:snapshot.id,snapshot},headers:{Prefer:'resolution=merge-duplicates,return=representation'}});},
    async deleteWatchlist(actor,id){await premium(actor);return request('/rest/v1/watchlist_items?user_id=eq.'+encodeURIComponent(actor.id)+'&title_id=eq.'+encodeURIComponent(id),actor.token,{method:'DELETE'});},
  };
}

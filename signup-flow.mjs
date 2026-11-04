// This metadata controls onboarding presentation only, never membership or authorization.
export const needsPasswordSetup = user => !!(user?.email_confirmed_at && user?.user_metadata?.signup_password_pending);
const pendingKey='su_pending_signup_v1';
export function readPendingSignup(storage,now=Date.now()){
  try{const value=JSON.parse(storage.getItem(pendingKey));
    if(!value||typeof value.email!=='string'||!Number.isFinite(value.sentAt)||value.sentAt>now||now-value.sentAt>86400000)return null;
    return {email:value.email,sentAt:value.sentAt};
  }catch{return null;}
}
export function savePendingSignup(storage,value){
  try{if(value)storage.setItem(pendingKey,JSON.stringify(value));else storage.removeItem(pendingKey);}catch{}
}
export function signupErrorMessage(error){
  if(['over_email_send_rate_limit','over_request_rate_limit'].includes(error?.code)||error?.status===429)return 'Too many email requests. Please wait before trying again, and check your inbox and spam folder for the latest email.';
  if(['email_address_not_authorized','unexpected_failure','email_send_failed'].includes(error?.code))return 'We couldn’t send your verification email. Please try again shortly. If this continues, contact support@streamunify.com.';
  return error?.message||'We couldn’t complete that request. Please try again.';
}
export async function sendSignupEmail(client,email,redirectTo){
  const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:redirectTo,data:{signup_password_pending:true}}});
  if(error)throw error;
}
export async function saveVerifiedPassword(client,password,confirmation){
  if(password.length<12)throw Error('Use at least 12 characters for your password.');
  if(password!==confirmation)throw Error('Your passwords don’t match. Please try again.');
  // Verify with Auth rather than trusting a URL parameter or cached UI state.
  const {data,error}=await client.auth.getUser();
  if(error||!data?.user?.email_confirmed_at)throw Error('Verify your email first. Request a new verification link if yours has expired.');
  const result=await client.auth.updateUser({password,data:{signup_password_pending:false}});
  if(result.error)throw result.error;
  return result.data.user;
}

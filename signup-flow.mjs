// This metadata controls onboarding presentation only, never membership or authorization.
export const needsPasswordSetup = user => !!(user?.email_confirmed_at && user?.user_metadata?.signup_password_pending);
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

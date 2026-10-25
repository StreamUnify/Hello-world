const fingerprint=/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
export function passkeyConfiguration(env=process.env){
 const enabled=env.PASSKEYS_ENABLED==='true';
 const team=(env.APPLE_TEAM_ID||'').trim();
 const fingerprints=(env.ANDROID_SIGNING_CERT_SHA256||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
 const apple=/^[A-Z0-9]{10}$/.test(team)?{webcredentials:{apps:[team+'.com.streamunify.app']}}:null;
 const android=fingerprints.length&&fingerprints.every(s=>fingerprint.test(s))?[{relation:['delegate_permission/common.get_login_creds'],target:{namespace:'android_app',package_name:'com.streamunify.app',sha256_cert_fingerprints:fingerprints}}]:null;
 return {publicConfig:{web:enabled,ios:enabled&&!!apple&&env.PASSKEYS_IOS_ENABLED==='true',android:enabled&&!!android&&env.PASSKEYS_ANDROID_ENABLED==='true'},apple,android};
}

/** Satu kebijakan client/scope untuk autentikasi dan API direktori. */
var SsoClientAuthentication = (function () {
  var scopes={'authenticate.user':'auth:verify','directory.search':'directory:read','directory.get':'directory:read','user.status':'user:status'};
  function validate_(tx,props,envelope,skew,consume,operation) {
    var U=SsoDbUtils,S=SsoRequestSecurity;
    S.frame(envelope,'central-sso-app');
    if(!Object.prototype.hasOwnProperty.call(scopes,operation)||envelope.op!==operation)U.fail('PERMISSION_DENIED','Operasi tidak diizinkan.');
    var found=tx.list('ApplicationCredentials',{filters:{key_id:envelope.key_id},pageSize:1});
    if(found.total!==1)U.fail('INVALID_CLIENT','Client tidak diizinkan.');
    var credential=found.items[0];
    if(credential.application_id!==envelope.application_id)U.fail('INVALID_CLIENT','Client tidak diizinkan.');
    var secret=props.getProperty('SSO_CLIENT_SECRET_'+credential.key_id);
    if(!secret||!S.equal(S.sha(secret),credential.credential_fingerprint))U.fail('INVALID_CLIENT','Client tidak diizinkan.');
    S.verify(envelope,'central-sso-app',secret,skew);
    var app=tx.findById('Applications',credential.application_id);
    if(!app||app.application_status!=='active'||!app.api_access_enabled)U.fail('APPLICATION_INACTIVE','Aplikasi tidak aktif.');
    if(credential.status!=='active'||credential.revoked_at||credential.expires_at<=U.now())U.fail('INVALID_CLIENT','Client tidak diizinkan.');
    if(!SsoCredentialState.isCommitted_(tx,credential))U.fail('INVALID_CLIENT','Credential belum selesai diterbitkan.');
    if(JSON.parse(credential.allowed_scopes).indexOf(scopes[operation])<0)U.fail('PERMISSION_DENIED','Scope tidak diizinkan.');
    if(consume)S.rememberNonce(tx,envelope,'client:'+credential.key_id,300);
    return credential;
  }
  return {validate_:validate_};
})();

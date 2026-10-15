var SsoApiRouter = (function () {
  function handle_(event) {
    var request='unknown';
    try {
      if(!event||!event.postData||typeof event.postData.contents!=='string'||event.postData.contents.length>40000||event.contentLength>50000||String(event.postData.type||'').split(';')[0].toLowerCase()!=='application/json')SsoDbUtils.fail('VALIDATION_ERROR','Request JSON tidak valid.');
      var envelope;
      try {envelope=JSON.parse(event.postData.contents);}catch(e){SsoDbUtils.fail('VALIDATION_ERROR','JSON tidak valid.');}
      if(envelope&&typeof envelope.request_id==='string'&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(envelope.request_id))request=envelope.request_id;
      var props=PropertiesService.getScriptProperties();
      SsoRequestSecurity.frame(envelope,'central-sso-internal');
      if(envelope.key_id!==props.getProperty('SSO_GATEWAY_KEY_ID')||envelope.application_id!=='')SsoDbUtils.fail('INVALID_CLIENT','Gateway tidak valid.');
      SsoRequestSecurity.verify(envelope,'central-sso-internal',props.getProperty('SSO_GATEWAY_SECRET'),120);
      var result=SsoAuthentication.create_(SsoDatabase.configured_(),props).handle_(envelope);
      return {success:true,data:result,request_id:request,timestamp:SsoDbUtils.now()};
    } catch(e) {
      var allowed=['INVALID_CREDENTIALS','INVALID_CLIENT','INVALID_SIGNATURE','REQUEST_EXPIRED','REPLAY_DETECTED','RATE_LIMITED','PERMISSION_DENIED','APPLICATION_INACTIVE','VALIDATION_ERROR','INVALID_CHALLENGE','UNAUTHENTICATED','NOT_FOUND','VERSION_CONFLICT','OPERATION_ALREADY_PROCESSED','CREDENTIAL_LIMIT','INVALID_STATE','LAST_SUPER_ADMIN'];
      var code=allowed.indexOf(e.code)>=0?e.code:'SERVICE_UNAVAILABLE';
      return {success:false,error:{code:code,message:code==='INVALID_CREDENTIALS'?'Username atau password tidak valid, atau akun tidak dapat digunakan.':'Permintaan tidak dapat diproses.'},request_id:request,timestamp:SsoDbUtils.now()};
    }
  }
  return {handle_:handle_};
})();
function doPost(e) {
  return ContentService.createTextOutput(JSON.stringify(SsoApiRouter.handle_(e))).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({success:false,error:{code:'PERMISSION_DENIED',message:'Gunakan API server yang diizinkan.'},request_id:'unknown',timestamp:SsoDbUtils.now()})).setMimeType(ContentService.MimeType.JSON);
}

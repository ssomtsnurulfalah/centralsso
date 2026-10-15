/** Retensi secret kadaluwarsa; tidak menghapus metadata credential atau audit. */
function cleanupExpiredClientSecrets(){
  var props=PropertiesService.getScriptProperties();
  return SsoDatabase.configured_().atomic_(function(tx){
    var rows=tx.all_('ApplicationCredentials').filter(function(r){return r.status==='revoked'||!!r.revoked_at||r.status==='expired'||r.expires_at<=SsoDbUtils.now();}).filter(function(r){return !!props.getProperty('SSO_CLIENT_SECRET_'+r.key_id)||r.status==='active'&&r.expires_at<=SsoDbUtils.now();}).slice(0,500),removed=0;
    rows.forEach(function(r){
      if(r.status==='active'&&r.expires_at<=SsoDbUtils.now())tx.update('ApplicationCredentials',r.credential_id,{status:'expired'});
      if(props.getProperty('SSO_CLIENT_SECRET_'+r.key_id)){
        props.deleteProperty('SSO_CLIENT_SECRET_'+r.key_id);removed++;
        tx.insert('AuditLogs',{action:'credential.secret.cleanup',target_type:'credential',target_id:r.credential_id,result:'success',metadata:'{}'});
      }
    });
    return {examined:rows.length,removed:removed};
  });
}

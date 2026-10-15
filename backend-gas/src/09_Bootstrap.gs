/** Inisialisasi manual, bukan endpoint. JSON hanya metadata KDF, tanpa password. */
function bootstrapInitialSuperAdmin() {
  var props=PropertiesService.getScriptProperties(), raw=props.getProperty('SSO_BOOTSTRAP_USER_JSON');
  if(!raw)SsoDbUtils.fail('CONFIGURATION_ERROR','Metadata bootstrap belum ada.');
  var input=JSON.parse(raw);
  SsoRequestSecurity.exact(input,['username','full_name','email','password_hash','password_salt','password_algorithm','password_parameters']);
  return SsoDatabase.configured_().atomic_(function(tx){
    if(tx.list('Users',{pageSize:1}).total!==0)SsoDbUtils.fail('PERMISSION_DENIED','Bootstrap hanya untuk database pengguna kosong.');
    var user=tx.insert('Users',Object.assign({},input,{global_role:'super_admin',status:'active'}));
    SpreadsheetApp.flush();
    props.deleteProperty('SSO_BOOTSTRAP_USER_JSON');
    tx.insert('AuditLogs',{actor_user_id:user.user_id,action:'system.bootstrap',target_type:'user',target_id:user.user_id,result:'success',metadata:'{}'});
    return {user_id:user.user_id,username:user.username};
  });
}

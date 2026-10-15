/** Hanya gateway tepercaya dapat menerima material KDF atau menyelesaikan challenge. */
var SsoAuthentication = (function () {
  function create_(db,props) {
    var U=SsoDbUtils, S=SsoRequestSecurity;
    function settings(tx) {
      var map={};tx.all_('Settings').forEach(function(r){map[r.setting_key]=r.setting_value;});
      if(map.schema_version!==SsoSchema.version)U.fail('CONFIGURATION_ERROR','Versi skema tidak sesuai.');
      var fields=['login_max_attempts','login_window_seconds','login_lock_seconds','request_clock_skew_seconds','admin_session_absolute_seconds','admin_session_idle_seconds','password_min_length','password_max_length','reset_token_ttl_seconds','pagination_default','pagination_max'];
      fields.forEach(function(k){if(!/^\d+$/.test(map[k]||''))U.fail('CONFIGURATION_ERROR','Setting keamanan tidak valid.');map[k]=Number(map[k]);});
      if(map.login_max_attempts<1||map.login_max_attempts>20||map.login_window_seconds<60||map.login_window_seconds>86400||map.login_lock_seconds<60||map.login_lock_seconds>86400||map.request_clock_skew_seconds<10||map.request_clock_skew_seconds>120||map.admin_session_idle_seconds<60||map.admin_session_idle_seconds>map.admin_session_absolute_seconds||map.admin_session_absolute_seconds>86400||map.password_min_length<15||map.password_max_length<map.password_min_length||map.password_max_length>1024||map.reset_token_ttl_seconds<60||map.reset_token_ttl_seconds>3600||map.pagination_default<1||map.pagination_default>map.pagination_max||map.pagination_max>100)U.fail('CONFIGURATION_ERROR','Setting di luar batas aman.');
      return map;
    }
    function log(tx,request,user,application,result,reason) {
      tx.insert('AuthenticationLogs',{user_id:user||'',application_id:application||'',result:result,failure_reason_code:reason||'',request_id:request,metadata:'{}'});
    }
    function rejectAuth(tx,request,user,application,reason) {
      log(tx,request,user,application,'failure',reason);U.fail('INVALID_CREDENTIALS','Username atau password tidak valid, atau akun tidak dapat digunakan.');
    }
    function validateClient(tx,envelope,skew,consume) {
      return SsoClientAuthentication.validate_(tx,props,envelope,skew,consume,'authenticate.user');
    }
    function rate(tx,username,application,config) {
      // HMAC mencegah daftar username mentah berada pada sheet rate limits.
      var subject=S.hmac('account:'+username,props.getProperty('SSO_RATE_LIMIT_SECRET'));
      // Batas aplikasi diperiksa dulu agar request yang sudah dibatasi tidak
      // membuat counter akun baru untuk username acak. Keduanya sebelum KDF.
      [{subject:S.hmac('application:'+application,props.getProperty('SSO_RATE_LIMIT_SECRET')),app:application,limit:config.login_max_attempts*20},{subject:subject,app:'',limit:config.login_max_attempts}].forEach(function(rule){
        var row=tx.list('AuthenticationRateLimits',{filters:{subject_key:rule.subject,application_id:rule.app},pageSize:1});
        if(row.total>1)U.fail('DATA_INTEGRITY_ERROR','Counter login duplikat.');
        var old=row.items[0], now=Date.now();
        if(old && old.locked_until && Date.parse(old.locked_until)>now)U.fail('RATE_LIMITED','Terlalu banyak percobaan. Coba kembali nanti.');
        var reset=!old || now-Date.parse(old.window_started_at)>=config.login_window_seconds*1000 || !!old.locked_until;
        var count=reset?1:old.attempt_count+1;
        var patch={subject_key:rule.subject,application_id:rule.app,attempt_count:count,window_started_at:reset?U.now():old.window_started_at,locked_until:count>=rule.limit?new Date(now+config.login_lock_seconds*1000).toISOString():''};
        if(old)tx.update('AuthenticationRateLimits',old.rate_limit_id,patch);else tx.insert('AuthenticationRateLimits',patch);
        if(count>rule.limit)U.fail('RATE_LIMITED','Terlalu banyak percobaan.');
      });
    }
    function material(user) {return {password_hash:user.password_hash,password_salt:user.password_salt,password_algorithm:user.password_algorithm,password_parameters:user.password_parameters};}
    function userDto(user) {return {sso_user_id:user.user_id,username:user.username,full_name:user.full_name,account_status:user.status,identity_version:user.identity_version};}
    function challengeId(binding) {return 'chl_'+S.sha(binding);}
    function prepare(tx,p,admin,request,config) {
      var application='',binding,credentials,username;
      if(admin) {
        S.exact(p,['username','challenge_nonce']);
        if(!/^[0-9a-f]{64}$/.test(p.challenge_nonce))U.fail('VALIDATION_ERROR','Challenge tidak valid.');
        username=U.normalizeUsername(p.username);binding='admin:'+p.challenge_nonce;
      } else {
        S.exact(p,['client']);
        try {credentials=validateClient(tx,p.client,config.request_clock_skew_seconds,true);}
        catch(e){log(tx,request,'','','failure',e.code||'INVALID_CLIENT');throw e;}
        application=credentials.application_id;request=p.client.request_id;
        var data=S.payload(p.client);S.exact(data,['username','password']);
        if(typeof data.password!=='string'||Array.from(data.password).length<1||Array.from(data.password).length>1024)U.fail('VALIDATION_ERROR','Format kredensial tidak valid.');
        username=U.normalizeUsername(data.username);binding='client:'+S.frame(p.client,'central-sso-app')+':'+p.client.signature;
      }
      try {rate(tx,username,application,config);}catch(e){log(tx,request,'',application,'failure',e.code);throw e;}
      var users=tx.list('Users',{filters:{username:username},pageSize:1});
      if(users.total>1)U.fail('DATA_INTEGRITY_ERROR','Username duplikat.');
      if(!users.total){log(tx,request,'',application,'failure','INVALID_CREDENTIALS');return {challenge_id:null,material:null};}
      var user=users.items[0], id=challengeId(binding);
      tx.insert('AuthenticationChallenges',{challenge_id:id,user_id:user.user_id,application_id:application,purpose:admin?'admin_login':'user_verify',identity_version:user.identity_version,expires_at:new Date(Date.now()+90000).toISOString(),status:'active'});
      // Journal menyimpan request_id, bukan password/payload. target_id bertipe string internal.
      tx.insert('OperationJournal',{operation_id:id,operation_type:'authentication',target_type:'request',target_id:request,state:'pending'});
      return {challenge_id:id,material:material(user)};
    }
    function finish(tx,p,admin,config) {
      S.exact(p,admin?['challenge_id','challenge_nonce','password_valid','session_token_hash']:['challenge_id','client','password_valid']);
      if(typeof p.password_valid!=='boolean'||(typeof p.challenge_id!=='string'&&p.challenge_id!==null))U.fail('VALIDATION_ERROR','Hasil verifikasi tidak valid.');
      var binding;
      if(admin) {
        if(!/^[0-9a-f]{64}$/.test(p.challenge_nonce)||!/^[0-9a-f]{64}$/.test(p.session_token_hash))U.fail('VALIDATION_ERROR','Token tidak valid.');
        binding='admin:'+p.challenge_nonce;
      } else {
        validateClient(tx,p.client,config.request_clock_skew_seconds,false);
        binding='client:'+S.frame(p.client,'central-sso-app')+':'+p.client.signature;
      }
      // Username tak ditemukan tetap menjalani dummy KDF dan finish RPC di gateway.
      if(p.challenge_id===null)U.fail('INVALID_CREDENTIALS','Username atau password tidak valid, atau akun tidak dapat digunakan.');
      if(p.challenge_id!==challengeId(binding))U.fail('INVALID_CHALLENGE','Challenge tidak cocok.');
      var challenge=tx.findById('AuthenticationChallenges',p.challenge_id);
      var journal=tx.findById('OperationJournal',p.challenge_id);
      if(!challenge || !journal || journal.state!=='pending' || challenge.status!=='active' || challenge.consumed_at || challenge.expires_at<=U.now() || challenge.purpose!==(admin?'admin_login':'user_verify') || (!admin&&challenge.application_id!==p.client.application_id))U.fail('INVALID_CHALLENGE','Challenge tidak dapat digunakan.');
      // Simpan konsumsi SEBELUM efek lain. Kegagalan berikutnya tidak membuka replay.
      tx.update('AuthenticationChallenges',challenge.challenge_id,{status:'used',consumed_at:U.now()});SpreadsheetApp.flush();
      var user=tx.findById('Users',challenge.user_id), reason='';
      if(!user||!p.password_valid)reason='INVALID_CREDENTIALS';
      else if(user.archived_at)reason='ACCOUNT_ARCHIVED';
      else if(user.status==='inactive')reason='ACCOUNT_INACTIVE';
      else if(user.status==='suspended')reason='ACCOUNT_SUSPENDED';
      else if(user.identity_version!==challenge.identity_version)reason='IDENTITY_CHANGED';
      else if(admin&&['super_admin','admin'].indexOf(user.global_role)<0)reason='ADMIN_ACCESS_DENIED';
      if(reason) {
        tx.update('OperationJournal',journal.operation_id,{state:'failed',error_code:reason});
        rejectAuth(tx,journal.target_id,challenge.user_id,challenge.application_id,reason);
      }
      var timestamp=U.now(), result=userDto(user);
      if(admin) {
        var expires=new Date(Date.now()+config.admin_session_absolute_seconds*1000).toISOString();
        tx.insert('AdminSessions',{user_id:user.user_id,session_token_hash:p.session_token_hash,created_at:timestamp,expires_at:expires,last_activity_at:timestamp,identity_version:user.identity_version,idle_expires_at:new Date(Math.min(Date.parse(expires),Date.now()+config.admin_session_idle_seconds*1000)).toISOString()});
        result.global_role=user.global_role;result.session_expires_at=expires;
      }
      tx.touchLastLogin_(user.user_id,user.identity_version,timestamp);
      log(tx,journal.target_id,user.user_id,challenge.application_id,'success','');
      tx.update('OperationJournal',journal.operation_id,{state:'completed'});
      result.authenticated_at=timestamp;result.request_id=journal.target_id;return result;
    }
    function session(tx,hash,config) {
      if(!/^[0-9a-f]{64}$/.test(hash||''))U.fail('UNAUTHENTICATED','Sesi tidak valid.');
      var rows=tx.list('AdminSessions',{filters:{session_token_hash:hash},pageSize:1});
      var row=rows.total===1?rows.items[0]:null;
      if(!row||row.revoked_at||row.expires_at<=U.now()||row.idle_expires_at<=U.now())U.fail('UNAUTHENTICATED','Sesi tidak valid.');
      var user=tx.findById('Users',row.user_id);
      if(!user||user.archived_at||user.status!=='active'||user.identity_version!==row.identity_version||['super_admin','admin'].indexOf(user.global_role)<0)U.fail('UNAUTHENTICATED','Sesi tidak valid.');
      if(Date.now()-Date.parse(row.last_activity_at)>=60000)tx.update('AdminSessions',row.session_id,{last_activity_at:U.now(),idle_expires_at:new Date(Math.min(Date.parse(row.expires_at),Date.now()+config.admin_session_idle_seconds*1000)).toISOString()});
      return {row:row,user:user};
    }
    function passwordMaterial(p,user,config) {
      S.exact(p.material,['password_hash','password_salt','password_algorithm','password_parameters']);
      if(!Number.isSafeInteger(p.password_length)||p.password_length<config.password_min_length||p.password_length>config.password_max_length)U.fail('VALIDATION_ERROR','Password tidak memenuhi kebijakan.');
      var next=Object.assign({},user,p.material,{password_changed_at:U.now()});
      SsoRecordValidation.check('Users',next);return next;
    }
    function resetRecord(tx,hash) {
      if(!/^[0-9a-f]{64}$/.test(hash||''))U.fail('INVALID_CREDENTIALS','Token tidak valid.');
      var list=tx.list('PasswordResetTokens',{filters:{token_hash:hash},pageSize:1}), token=list.total===1?list.items[0]:null;
      if(!token||token.status!=='active'||token.used_at||token.expires_at<=U.now())U.fail('INVALID_CREDENTIALS','Token tidak dapat digunakan.');
      return token;
    }
    function passwordOperation(tx,op,p,config) {
      if(op==='password.reset.check') {S.exact(p,['token_hash']);resetRecord(tx,p.token_hash);return {valid:true};}
      if(op==='password.reset.complete') {
        S.exact(p,['token_hash','material','password_length']);
        var token=resetRecord(tx,p.token_hash), user=tx.findById('Users',token.user_id);
        if(!user||user.archived_at)U.fail('INVALID_CREDENTIALS','Token tidak dapat digunakan.');
        passwordMaterial(p,user,config);
        var journal=tx.insert('OperationJournal',{operation_type:'password.reset',target_type:'user',target_id:user.user_id,state:'pending'});
        tx.update('PasswordResetTokens',token.reset_id,{status:'used',used_at:U.now()});SpreadsheetApp.flush();
        tx.update('Users',user.user_id,Object.assign({},p.material,{password_changed_at:U.now()}),user.identity_version);
        tx.insert('AuditLogs',{action:'password.reset.complete',target_type:'user',target_id:user.user_id,result:'success',metadata:JSON.stringify({operation_id:journal.operation_id})});
        tx.update('OperationJournal',journal.operation_id,{state:'completed'});return {changed:true};
      }
      S.exact(p,op==='password.replace'?['session_token_hash','material','password_length']:['session_token_hash','user_id','token_hash']);
      var s=session(tx,p.session_token_hash,config);
      if(Date.now()-Date.parse(s.row.created_at)>300000)U.fail('PERMISSION_DENIED','Login ulang diperlukan.');
      if(op==='password.replace') {
        passwordMaterial(p,s.user,config);
        var operation=tx.insert('OperationJournal',{operation_type:'password.change',target_type:'user',target_id:s.user.user_id,state:'pending'});
        tx.update('Users',s.user.user_id,Object.assign({},p.material,{password_changed_at:U.now()}),s.user.identity_version);
        tx.insert('AuditLogs',{actor_user_id:s.user.user_id,action:'password.change',target_type:'user',target_id:s.user.user_id,result:'success',metadata:JSON.stringify({operation_id:operation.operation_id})});
        tx.update('OperationJournal',operation.operation_id,{state:'completed'});return {changed:true,reauthentication_required:true};
      }
      if(s.user.global_role!=='super_admin')U.fail('PERMISSION_DENIED','Hanya Super Admin dapat menerbitkan reset.');
      var target=tx.findById('Users',p.user_id);
      if(!target||target.archived_at)U.fail('VALIDATION_ERROR','Target tidak tersedia.');
      if(!/^[0-9a-f]{64}$/.test(p.token_hash))U.fail('VALIDATION_ERROR','Digest token tidak valid.');
      // Token lama masih tersimpan untuk audit, tetapi tidak bisa digunakan.
      tx.all_('PasswordResetTokens').filter(function(r){return r.user_id===target.user_id&&r.status==='active';}).forEach(function(r){tx.update('PasswordResetTokens',r.reset_id,{status:'revoked'});});
      var expires=new Date(Date.now()+config.reset_token_ttl_seconds*1000).toISOString();
      var issued=tx.insert('PasswordResetTokens',{user_id:target.user_id,token_hash:p.token_hash,expires_at:expires,status:'active'});
      tx.insert('AuditLogs',{actor_user_id:s.user.user_id,action:'password.reset.issue',target_type:'user',target_id:target.user_id,result:'success',metadata:'{}'});
      return {reset_id:issued.reset_id,expires_at:expires};
    }
    function dispatch(tx,op,p,request,config) {
      if(SsoAdminService.supports_(op))return SsoAdminService.execute_(tx,op,p,session(tx,p.session_token_hash,config),config,props);
      if(SsoApplicationRegistry.supports_(op))return SsoApplicationRegistry.execute_(tx,props,op,p,session(tx,p.session_token_hash,config),config);
      if(op==='directory.execute') {S.exact(p,['client']);return SsoUserDirectory.execute_(tx,props,p.client,config);}
      if(op==='user.prepare')return prepare(tx,p,false,request,config);
      if(op==='user.finish')return finish(tx,p,false,config);
      if(op==='admin.prepare')return prepare(tx,p,true,request,config);
      if(op==='admin.finish')return finish(tx,p,true,config);
      if(op==='session.validate'||op==='session.revoke') {
        S.exact(p,['session_token_hash']);var s=session(tx,p.session_token_hash,config);
        if(op==='session.revoke') {
          tx.update('AdminSessions',s.row.session_id,{revoked_at:U.now()});
          tx.insert('AuditLogs',{actor_user_id:s.user.user_id,action:'session.logout',target_type:'session',target_id:s.row.session_id,result:'success',metadata:'{}'});
          return {revoked:true};
        }
        return Object.assign(userDto(s.user),{global_role:s.user.global_role});
      }
      if(['password.replace','password.reset.issue','password.reset.check','password.reset.complete'].indexOf(op)>=0)return passwordOperation(tx,op,p,config);
      if(op==='password.policy') {S.exact(p,[]);return {min_length:config.password_min_length,max_length:config.password_max_length};}
      U.fail('PERMISSION_DENIED','Operasi internal tidak diizinkan.');
    }
    function handle_(envelope) {
      // Signature internal diverifikasi sebelum membaca database.
      var key=props.getProperty('SSO_GATEWAY_KEY_ID'), secret=props.getProperty('SSO_GATEWAY_SECRET');
      S.frame(envelope,'central-sso-internal');
      if(envelope.key_id!==key||envelope.application_id!=='')U.fail('INVALID_CLIENT','Gateway tidak valid.');
      S.verify(envelope,'central-sso-internal',secret,120);
      if(!/^[0-9a-f]{64}$/.test(props.getProperty('SSO_RATE_LIMIT_SECRET')||''))U.fail('CONFIGURATION_ERROR','Kunci rate limit belum ada.');
      return db.atomic_(function(tx){
        var config=settings(tx);
        // Tetap verifikasi toleransi aktif; batas awal di atas hanya ceiling sebelum DB.
        S.verify(envelope,'central-sso-internal',secret,config.request_clock_skew_seconds);
        S.rememberNonce(tx,envelope,'gateway:'+key,300);
        return dispatch(tx,envelope.op,S.payload(envelope),envelope.request_id,config);
      });
    }
    return {handle_:handle_};
  }
  return {create_:create_};
})();

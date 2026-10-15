/** Operasi panel admin. Identitas aktor selalu berasal dari sesi terverifikasi. */
var SsoAdminService = (function () {
  var ops=['panel.dashboard','panel.users.list','panel.users.create','panel.users.update','panel.users.archive','panel.logs.list','panel.settings.get','panel.settings.update','panel.profile.get','panel.profile.update','panel.preferences.get','panel.integration.preflight'];
  var publicFields=['user_id','username','full_name','email','global_role','status','created_at','updated_at','last_login','password_changed_at','identity_version','archived_at'];
  function dto(user){var out={};publicFields.forEach(function(k){out[k]=user[k];});return out;}
  function fail(code){SsoDbUtils.fail(code,code==='PERMISSION_DENIED'?'Akses tidak diizinkan.':'Data panel tidak valid.');}
  function exact(p,fields){SsoRequestSecurity.exact(p,['session_token_hash'].concat(fields));}
  function fresh(s){if(Date.now()-Date.parse(s.row.created_at)>300000)fail('PERMISSION_DENIED');}
  function text(v,min,max){return typeof v==='string'&&v.trim().length>=min&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v);}
  function input(p,allowed,required){
    if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(function(k){return allowed.indexOf(k)<0;})||!Object.keys(p).length||required.some(function(k){return p[k]===undefined;}))fail('VALIDATION_ERROR');
    var out={};Object.keys(p).forEach(function(k){
      var v=p[k];
      if(k==='username')v=SsoDbUtils.normalizeUsername(v);
      else if(k==='full_name'){if(!text(v,1,160))fail('VALIDATION_ERROR');v=v.trim();}
      else if(k==='email'){if(!text(v,3,254)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail('VALIDATION_ERROR');v=v.trim();}
      else if(k==='status'){if(['active','inactive','suspended'].indexOf(v)<0)fail('VALIDATION_ERROR');}
      else if(k==='global_role'){if(['super_admin','admin','user'].indexOf(v)<0)fail('VALIDATION_ERROR');}
      out[k]=v;
    });return out;
  }
  function page(rows,f,config,fields){
    if(!f||typeof f!=='object'||Array.isArray(f)||Object.keys(f).some(function(k){return fields.indexOf(k)<0;}))fail('VALIDATION_ERROR');
    var n=f.page===undefined?1:f.page,size=f.page_size===undefined?config.pagination_default:f.page_size;
    if(!Number.isSafeInteger(n)||n<1||n>1000000||!Number.isSafeInteger(size)||size<1||size>config.pagination_max)fail('VALIDATION_ERROR');
    var total=rows.length,pages=Math.ceil(total/size);return {items:rows.slice((n-1)*size,n*size),pagination:{page:n,page_size:size,total:total,total_pages:pages,has_next:n<pages}};
  }
  function query(f){if(f.query===undefined)return '';if(!text(f.query,0,100))fail('VALIDATION_ERROR');return f.query.trim().toLowerCase();}
  function version(r,v){if(!Number.isSafeInteger(v)||v<1)fail('VALIDATION_ERROR');if(r.identity_version!==v)fail('VERSION_CONFLICT');}
  function audit(tx,s,action,type,id,fields,operation){var m={changed_fields:fields};if(operation)m.operation_id=operation;tx.insert('AuditLogs',{actor_user_id:s.user.user_id,action:action,target_type:type,target_id:id,result:'success',metadata:JSON.stringify(m)});}
  function write(tx,s,p,type,target,callback){
    if(typeof p.operation_id!=='string'||!/^op_[a-zA-Z0-9_-]{1,100}$/.test(p.operation_id))fail('VALIDATION_ERROR');
    if(tx.findById('OperationJournal',p.operation_id))fail('OPERATION_ALREADY_PROCESSED');
    var j=tx.insert('OperationJournal',{operation_id:p.operation_id,operation_type:type,target_type:'user',target_id:target,state:'pending'});
    try{var result=callback(j);tx.update('OperationJournal',j.operation_id,{state:'completed'});return Object.assign(result,{operation_id:j.operation_id});}
    catch(e){try{tx.update('OperationJournal',j.operation_id,{state:'needs_reconciliation',error_code:e.code||'SERVICE_UNAVAILABLE'});}catch(ignored){}throw e;}
  }
  function execute_(tx,op,p,s,config,props){
    var superAdmin=s.user.global_role==='super_admin',U=SsoDbUtils;
    if(op==='panel.preferences.get'){exact(p,[]);var out={};['system_name','institution_name','display_timezone'].forEach(function(k){out[k]=tx.findById('Settings',k).setting_value;});return out;}
    function target(){if(typeof p.user_id!=='string'||!/^[a-zA-Z0-9_.:-]{1,160}$/.test(p.user_id))fail('VALIDATION_ERROR');var r=tx.findById('Users',p.user_id);if(!r)fail('NOT_FOUND');if(!superAdmin&&r.global_role!=='user')fail('PERMISSION_DENIED');return r;}
    if(op==='panel.profile.get'){exact(p,[]);return {user:dto(s.user)};}
    if(op==='panel.profile.update'){
      exact(p,['patch','expected_version','operation_id']);var patch=input(p.patch,['full_name','email'],[]);version(s.user,p.expected_version);
      return write(tx,s,p,'profile.update',s.user.user_id,function(j){var r=tx.update('Users',s.user.user_id,patch,p.expected_version);audit(tx,s,op,'user',r.user_id,Object.keys(patch),j.operation_id);return {user:dto(r),reauthentication_required:true};});
    }
    if(op==='panel.dashboard'){
      exact(p,[]);var users=tx.all_('Users').filter(function(r){return superAdmin||r.global_role==='user';});
      var logs=superAdmin?tx.all_('AuthenticationLogs'):[],cutoff=Date.now()-86400000,recent=logs.filter(function(r){return Date.parse(r.timestamp)>=cutoff;});
      return {users_total:users.filter(function(r){return !r.archived_at;}).length,users_active:users.filter(function(r){return !r.archived_at&&r.status==='active';}).length,users_archived:users.filter(function(r){return !!r.archived_at;}).length,applications_total:superAdmin?tx.all_('Applications').length:null,auth_success_24h:superAdmin?recent.filter(function(r){return r.result==='success';}).length:null,auth_failure_24h:superAdmin?recent.filter(function(r){return r.result==='failure';}).length:null,recent_logs:logs.sort(function(a,b){return b.timestamp.localeCompare(a.timestamp);}).slice(0,6),generated_at:U.now()};
    }
    if(op==='panel.users.list'){
      exact(p,['filters']);var f=p.filters,q=query(f);if(f.status!==undefined&&['all','active','inactive','suspended','archived'].indexOf(f.status)<0)fail('VALIDATION_ERROR');
      var rows=tx.all_('Users').filter(function(r){return (superAdmin||r.global_role==='user')&&(f.status==='archived'?!!r.archived_at:!r.archived_at&&(!f.status||f.status==='all'||r.status===f.status))&&(!q||[r.username,r.full_name,r.email,r.user_id].join(' ').toLowerCase().indexOf(q)>=0);}).sort(function(a,b){return a.username.localeCompare(b.username);}).map(dto);
      return page(rows,f,config,['query','status','page','page_size']);
    }
    if(op==='panel.users.create'){
      exact(p,['user','material','password_length','operation_id']);var fields=['username','full_name','email','global_role','status'],user=input(p.user,fields,fields);
      if(!superAdmin&&user.global_role!=='user')fail('PERMISSION_DENIED');if(user.global_role!=='user')fresh(s);
      if(!Number.isSafeInteger(p.password_length)||p.password_length<config.password_min_length||p.password_length>config.password_max_length)fail('VALIDATION_ERROR');
      SsoRequestSecurity.exact(p.material,['password_hash','password_salt','password_algorithm','password_parameters']);
      if(tx.list('Users',{filters:{username:user.username},pageSize:1}).total)fail('VERSION_CONFLICT');
      var id='usr_'+Utilities.getUuid(),candidate=Object.assign({},user,p.material,{user_id:id});
      // Database validation also checks KDF and duplicate username under this same lock.
      return write(tx,s,p,'user.create',id,function(j){var r=tx.insert('Users',candidate);audit(tx,s,op,'user',r.user_id,fields,j.operation_id);return {user:dto(r)};});
    }
    if(op==='panel.users.update'||op==='panel.users.archive'){
      exact(p,op==='panel.users.archive'?['user_id','expected_version','operation_id']:['user_id','expected_version','patch','operation_id']);var old=target();version(old,p.expected_version);if(old.archived_at)fail('INVALID_STATE');
      var update=op==='panel.users.archive'?{status:'inactive',archived_at:U.now()}:input(p.patch,['username','full_name','email','global_role','status'],[]);
      if(!superAdmin&&update.global_role!==undefined&&update.global_role!=='user')fail('PERMISSION_DENIED');
      if(old.global_role!=='user'||update.global_role&&update.global_role!=='user')fresh(s);
      if(update.username&&update.username!==old.username&&tx.list('Users',{filters:{username:update.username},pageSize:1}).total)fail('VERSION_CONFLICT');
      if(old.global_role==='super_admin'&&old.status==='active'&&!old.archived_at&&(update.global_role&&update.global_role!=='super_admin'||update.status&&update.status!=='active'||update.archived_at)&&tx.all_('Users').filter(function(r){return r.global_role==='super_admin'&&r.status==='active'&&!r.archived_at;}).length<=1)fail('LAST_SUPER_ADMIN');
      return write(tx,s,p,op==='panel.users.archive'?'user.archive':'user.update',old.user_id,function(j){var r=tx.update('Users',old.user_id,update,p.expected_version);audit(tx,s,op,'user',r.user_id,Object.keys(update),j.operation_id);return {user:dto(r),reauthentication_required:r.user_id===s.user.user_id};});
    }
    // Logs and system settings are restricted to Super Admin in GAS, not only in the UI.
    if(!superAdmin)fail('PERMISSION_DENIED');
    if(op==='panel.integration.preflight'){exact(p,[]);fresh(s);return {environment:props.getProperty('SSO_ENVIRONMENT'),schema_version:SsoSchema.version,integration_version:1};}
    if(op==='panel.logs.list'){
      exact(p,['kind','filters']);if(['authentication','audit'].indexOf(p.kind)<0)fail('VALIDATION_ERROR');var f=p.filters,q=query(f);
      if(f.result!==undefined&&['all','success','failure'].indexOf(f.result)<0)fail('VALIDATION_ERROR');
      var rows=tx.all_(p.kind==='audit'?'AuditLogs':'AuthenticationLogs').filter(function(r){return (!f.result||f.result==='all'||r.result===f.result)&&(!q||[r.user_id,r.actor_user_id,r.application_id,r.action,r.failure_reason_code,r.request_id,r.target_id].join(' ').toLowerCase().indexOf(q)>=0);}).sort(function(a,b){return b.timestamp.localeCompare(a.timestamp);});
      return page(rows,f,config,['query','result','page','page_size']);
    }
    if(op==='panel.settings.get'){exact(p,[]);return {items:tx.all_('Settings')};}
    if(op==='panel.settings.update'){
      exact(p,['setting_key','setting_value','expected_value']);fresh(s);
      if(['system_name','institution_name','display_timezone'].indexOf(p.setting_key)<0||!text(p.setting_value,1,160)||typeof p.expected_value!=='string')fail('VALIDATION_ERROR');
      if(p.setting_key==='display_timezone'&&['Asia/Jakarta','Asia/Makassar','Asia/Jayapura','UTC'].indexOf(p.setting_value)<0)fail('VALIDATION_ERROR');
      var r=tx.findById('Settings',p.setting_key);if(!r||r.setting_value!==p.expected_value)fail('VERSION_CONFLICT');
      var updated=tx.update('Settings',p.setting_key,{setting_value:p.setting_value.trim()});audit(tx,s,op,'setting',p.setting_key,['setting_value']);return {setting:updated};
    }
    fail('PERMISSION_DENIED');
  }
  return {supports_:function(op){return ops.indexOf(op)>=0;},execute_:execute_};
})();

var SsoCredentialState = (function () {
  function revision_(r) {
    return SsoRequestSecurity.sha(JSON.stringify([r.credential_id,r.application_id,r.credential_name,r.key_id,r.credential_fingerprint,r.allowed_scopes,r.status,r.created_at,r.expires_at,r.rotated_at,r.revoked_at]));
  }
  function isCommitted_(tx,r,journals) {
    return (journals||tx.all_('OperationJournal')).filter(function(j){return j.target_type==='credential_key'&&j.target_id===r.key_id&&['credential.issue','credential.rotate'].indexOf(j.operation_type)>=0||j.target_type==='credential'&&j.target_id===r.credential_id&&['credential.scopes','credential.revoke'].indexOf(j.operation_type)>=0;}).every(function(j){return j.state==='completed';});
  }
  return {revision_:revision_,isCommitted_:isCommitted_};
})();

var SsoApplicationRegistry = (function () {
  var operations=['registry.app.list','registry.app.get','registry.app.create','registry.app.update','registry.app.disable','registry.credential.list','registry.credential.get','registry.credential.issue','registry.credential.rotate','registry.credential.revoke','registry.credential.scopes','registry.operation.get'];
  var sensitive=['registry.credential.issue','registry.credential.rotate','registry.credential.revoke','registry.credential.scopes'];
  var appFields=['application_name','application_description','application_url','application_type','application_status','api_access_enabled'];
  function supports_(op){return operations.indexOf(op)>=0;}
  function id(value,field){if(typeof value!=='string'||!/^[a-zA-Z0-9_.:-]{1,160}$/.test(value))SsoDbUtils.fail('VALIDATION_ERROR',field+' tidak valid.');return value;}
  function exact(p,fields){SsoRequestSecurity.exact(p,['session_token_hash'].concat(fields));}
  function text(value,min,max){return typeof value==='string'&&value.trim().length>=min&&Array.from(value).length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);}
  function url(value){
    if(typeof value!=='string'||value.length>2048)return false;
    var m=/^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?(?:[/?#][^\s\\]*)?$/i.exec(value);
    return !!m&&(!m[2]||(+m[2]>=1&&+m[2]<=65535))&&m[1].split('.').every(function(label){return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label);});
  }
  function appInput(input,partial){
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(function(k){return appFields.indexOf(k)<0;})||(!partial&&appFields.some(function(k){return input[k]===undefined;}))||(partial&&!Object.keys(input).length))SsoDbUtils.fail('VALIDATION_ERROR','Data aplikasi tidak valid.');
    Object.keys(input).forEach(function(k){
      var v=input[k],ok=k==='application_name'?text(v,1,160):k==='application_description'?text(v,0,2000):k==='application_url'?url(v):k==='application_type'?typeof v==='string'&&/^[a-z][a-z0-9_-]{1,31}$/.test(v):k==='application_status'?['active','inactive'].indexOf(v)>=0:typeof v==='boolean';
      if(!ok)SsoDbUtils.fail('VALIDATION_ERROR','Field aplikasi tidak valid: '+k);
    });
    var out={};Object.keys(input).forEach(function(k){out[k]=typeof input[k]==='string'?input[k].trim():input[k];});return out;
  }
  function scopes(value){if(!Array.isArray(value)||!value.length||value.length>3||new Set(value).size!==value.length||value.some(function(s){return ['auth:verify','directory:read','user:status'].indexOf(s)<0;}))SsoDbUtils.fail('VALIDATION_ERROR','Scope tidak valid.');return value.slice().sort();}
  function options(value,old){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(function(k){return ['credential_name','allowed_scopes','expires_in_seconds'].indexOf(k)<0;}))SsoDbUtils.fail('VALIDATION_ERROR','Opsi credential tidak valid.');
    var name=value.credential_name===undefined&&old?old.credential_name:value.credential_name;
    var list=value.allowed_scopes===undefined&&old?JSON.parse(old.allowed_scopes):value.allowed_scopes;
    var ttl=value.expires_in_seconds===undefined?7776000:value.expires_in_seconds;
    if(!text(name,1,120)||!Number.isSafeInteger(ttl)||ttl<300||ttl>31536000)SsoDbUtils.fail('VALIDATION_ERROR','Nama/masa berlaku credential tidak valid.');
    return {credential_name:name.trim(),allowed_scopes:scopes(list),expires_in_seconds:ttl};
  }
  function application(tx,applicationId){var r=tx.findById('Applications',id(applicationId,'Application ID'));if(!r)SsoDbUtils.fail('NOT_FOUND','Aplikasi tidak ditemukan.');return r;}
  function credential(tx,credentialId){var r=tx.findById('ApplicationCredentials',id(credentialId,'Credential ID'));if(!r)SsoDbUtils.fail('NOT_FOUND','Credential tidak ditemukan.');return r;}
  function effective(r){return r.revoked_at||r.status==='revoked'?'revoked':r.status==='expired'||r.expires_at<=SsoDbUtils.now()?'expired':'active';}
  function appDto(r){return {application_id:r.application_id,application_name:r.application_name,application_description:r.application_description,application_url:r.application_url,application_type:r.application_type,application_status:r.application_status,api_access_enabled:r.api_access_enabled,created_at:r.created_at,updated_at:r.updated_at,record_version:r.record_version};}
  function credentialDto(tx,r,app,journals){
    var state=effective(r),committed=SsoCredentialState.isCommitted_(tx,r,journals);
    return {credential_id:r.credential_id,application_id:r.application_id,credential_name:r.credential_name,key_id:r.key_id,credential_fingerprint:r.credential_fingerprint,allowed_scopes:JSON.parse(r.allowed_scopes),status:r.status,effective_status:state,lifecycle_committed:committed,usable:state==='active'&&committed&&app.application_status==='active'&&app.api_access_enabled,created_at:r.created_at,expires_at:r.expires_at,rotated_at:r.rotated_at,revoked_at:r.revoked_at,revision:SsoCredentialState.revision_(r)};
  }
  function audit(tx,user,action,type,target,operation,changed,result){
    var m={};if(operation)m.operation_id=operation;if(changed)m.changed_fields=changed;
    tx.insert('AuditLogs',{actor_user_id:user.user_id,action:action,target_type:type,target_id:target,result:result||'success',metadata:JSON.stringify(m)});
  }
  function fresh(context){if(Date.now()-Date.parse(context.row.created_at)>300000)SsoDbUtils.fail('PERMISSION_DENIED','Login ulang diperlukan.');}
  function revision(r,expected){if(typeof expected!=='string'||!/^[0-9a-f]{64}$/.test(expected))SsoDbUtils.fail('VALIDATION_ERROR','Revision wajib diisi.');if(expected!==SsoCredentialState.revision_(r))SsoDbUtils.fail('VERSION_CONFLICT','Metadata credential telah berubah.');}
  function start(tx,operationId,type,targetType,target){
    id(operationId,'Operation ID');
    if(tx.findById('OperationJournal',operationId))SsoDbUtils.fail('OPERATION_ALREADY_PROCESSED','Operation ID sudah digunakan.');
    return tx.insert('OperationJournal',{operation_id:operationId,operation_type:type,target_type:targetType,target_id:target,state:'pending'});
  }
  function complete(tx,j){tx.update('OperationJournal',j.operation_id,{state:'completed'});}
  function failJournal(tx,j){try{tx.update('OperationJournal',j.operation_id,{state:'needs_reconciliation',error_code:'SERVICE_UNAVAILABLE'});}catch(ignored){}}
  function requireActive(app){if(app.application_status!=='active'||!app.api_access_enabled)SsoDbUtils.fail('APPLICATION_INACTIVE','Aplikasi/API belum aktif.');}
  function requireCredentialActive(tx,r){if(effective(r)!=='active'||!SsoCredentialState.isCommitted_(tx,r))SsoDbUtils.fail('INVALID_STATE','Credential tidak aktif atau belum selesai diterbitkan.');}
  function issue(tx,props,p,context,rotating){
    exact(p,rotating?['credential_id','expected_revision','options','key_id','secret','operation_id']:['application_id','options','key_id','secret','operation_id']);
    var old=rotating?credential(tx,p.credential_id):null;
    if(old){revision(old,p.expected_revision);requireCredentialActive(tx,old);}
    var app=application(tx,old?old.application_id:p.application_id);requireActive(app);
    var data=options(p.options,old);
    if(typeof p.key_id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(p.key_id)||typeof p.secret!=='string'||!/^[0-9a-f]{64}$/.test(p.secret))SsoDbUtils.fail('VALIDATION_ERROR','Material credential tidak valid.');
    if(props.getProperty('SSO_CLIENT_SECRET_'+p.key_id)||tx.list('ApplicationCredentials',{filters:{key_id:p.key_id},pageSize:1}).total)SsoDbUtils.fail('VERSION_CONFLICT','Key ID sudah digunakan.');
    var active=tx.all_('ApplicationCredentials').filter(function(r){return (!old||r.credential_id!==old.credential_id)&&effective(r)==='active';});
    if(active.length>=1000||active.filter(function(r){return r.application_id===app.application_id;}).length>=20)SsoDbUtils.fail('CREDENTIAL_LIMIT','Batas credential aktif tercapai.');
    var j=start(tx,p.operation_id,rotating?'credential.rotate':'credential.issue','credential_key',p.key_id),added=null;
    try{
      if(old){
        tx.update('ApplicationCredentials',old.credential_id,{status:'revoked',revoked_at:SsoDbUtils.now(),rotated_at:SsoDbUtils.now()});SpreadsheetApp.flush();
        props.deleteProperty('SSO_CLIENT_SECRET_'+old.key_id);
        audit(tx,context.user,'credential.rotate.revoke','credential',old.credential_id,j.operation_id,['status','revoked_at','rotated_at']);
      }
      props.setProperty('SSO_CLIENT_SECRET_'+p.key_id,p.secret);
      added=tx.insert('ApplicationCredentials',{application_id:app.application_id,credential_name:data.credential_name,key_id:p.key_id,credential_fingerprint:SsoRequestSecurity.sha(p.secret),allowed_scopes:JSON.stringify(data.allowed_scopes),status:'active',expires_at:new Date(Date.now()+data.expires_in_seconds*1000).toISOString()});
      audit(tx,context.user,rotating?'credential.rotate':'credential.issue','credential',added.credential_id,j.operation_id,['key_id','allowed_scopes','expires_at']);
      complete(tx,j);
      return {credential:credentialDto(tx,added,app),operation_id:j.operation_id,previous_credential_id:old?old.credential_id:null};
    }catch(e){
      // Kompensasi tidak pernah mengaktifkan kembali credential lama.
      if(added){try{tx.update('ApplicationCredentials',added.credential_id,{status:'revoked',revoked_at:SsoDbUtils.now()});}catch(ignored){}}
      try{props.deleteProperty('SSO_CLIENT_SECRET_'+p.key_id);}catch(ignored){}
      failJournal(tx,j);throw e;
    }
  }
  function page(items,p,config,allowed){
    if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(function(k){return allowed.indexOf(k)<0;}))SsoDbUtils.fail('VALIDATION_ERROR','Filter tidak valid.');
    var n=p.page===undefined?1:p.page,size=p.page_size===undefined?config.pagination_default:p.page_size;
    if(!Number.isSafeInteger(n)||n<1||n>1000000||!Number.isSafeInteger(size)||size<1||size>config.pagination_max)SsoDbUtils.fail('VALIDATION_ERROR','Pagination tidak valid.');
    var count=items.length,pages=Math.ceil(count/size);
    return {items:items.slice((n-1)*size,n*size),pagination:{page:n,page_size:size,total:count,total_pages:pages,has_next:n<pages}};
  }
  function execute_(tx,props,op,p,context,config){
    if(!supports_(op))SsoDbUtils.fail('PERMISSION_DENIED','Operasi registry tidak diizinkan.');
    if(context.user.global_role!=='super_admin'){
      audit(tx,context.user,op,'registry','central_sso',null,null,'failure');SsoDbUtils.fail('PERMISSION_DENIED','Hanya Super Admin boleh mengelola aplikasi.');
    }
    if(sensitive.indexOf(op)>=0)fresh(context);
    if(['registry.app.create','registry.app.update','registry.app.disable'].concat(sensitive).indexOf(op)>=0){id(p.operation_id,'Operation ID');if(tx.findById('OperationJournal',p.operation_id))SsoDbUtils.fail('OPERATION_ALREADY_PROCESSED','Operation ID sudah digunakan.');}
    if(op==='registry.app.create'){
      exact(p,['application','operation_id']);var input=appInput(p.application,false);
      var appId='app_'+Utilities.getUuid(),j=start(tx,p.operation_id,'application.create','application',appId);
      try{var a=tx.insert('Applications',Object.assign({application_id:appId},input));audit(tx,context.user,'application.create','application',appId,j.operation_id,appFields);complete(tx,j);return {application:appDto(a),operation_id:j.operation_id};}catch(e){failJournal(tx,j);throw e;}
    }
    if(op==='registry.app.update'||op==='registry.app.disable'){
      exact(p,op==='registry.app.update'?['application_id','expected_version','patch','operation_id']:['application_id','expected_version','operation_id']);
      var app=application(tx,p.application_id),patch=op==='registry.app.update'?appInput(p.patch,true):{application_status:'inactive'};
      if(!Number.isSafeInteger(p.expected_version)||p.expected_version<1)SsoDbUtils.fail('VALIDATION_ERROR','Versi aplikasi wajib diisi.');
      if(app.record_version!==p.expected_version)SsoDbUtils.fail('VERSION_CONFLICT','Aplikasi telah berubah.');
      var job=start(tx,p.operation_id,op==='registry.app.update'?'application.update':'application.disable','application',app.application_id);
      try{var updated=tx.update('Applications',app.application_id,patch,p.expected_version);audit(tx,context.user,job.operation_type,'application',app.application_id,job.operation_id,Object.keys(patch));complete(tx,job);return {application:appDto(updated),operation_id:job.operation_id};}catch(e){failJournal(tx,job);throw e;}
    }
    if(op==='registry.app.get'){exact(p,['application_id']);return {application:appDto(application(tx,p.application_id))};}
    if(op==='registry.app.list'){
      exact(p,['filters']);var f=p.filters;
      if(!f||typeof f!=='object'||Array.isArray(f))SsoDbUtils.fail('VALIDATION_ERROR','Filter tidak valid.');
      if(f.query!==undefined&&(!text(f.query,0,100)))SsoDbUtils.fail('VALIDATION_ERROR','Query tidak valid.');
      if(f.status!==undefined&&['active','inactive','all'].indexOf(f.status)<0)SsoDbUtils.fail('VALIDATION_ERROR','Status filter tidak valid.');
      var q=f.query?f.query.trim().toLowerCase():'';
      var apps=tx.all_('Applications').filter(function(r){return (!f.status||f.status==='all'||r.application_status===f.status)&&(!q||r.application_name.toLowerCase().indexOf(q)>=0||r.application_description.toLowerCase().indexOf(q)>=0);});
      apps.sort(function(a,b){return a.application_id<b.application_id?-1:a.application_id>b.application_id?1:0;});
      return page(apps.map(appDto),f,config,['query','status','page','page_size']);
    }
    if(op==='registry.credential.issue'||op==='registry.credential.rotate')return issue(tx,props,p,context,op==='registry.credential.rotate');
    if(op==='registry.credential.get'){exact(p,['credential_id']);var c=credential(tx,p.credential_id);return {credential:credentialDto(tx,c,application(tx,c.application_id))};}
    if(op==='registry.credential.list'){
      exact(p,['application_id','filters']);var parent=application(tx,p.application_id),filter=p.filters;
      if(!filter||typeof filter!=='object'||Array.isArray(filter)||filter.status!==undefined&&['active','expired','revoked','all'].indexOf(filter.status)<0)SsoDbUtils.fail('VALIDATION_ERROR','Filter credential tidak valid.');
      var items=tx.all_('ApplicationCredentials').filter(function(r){return r.application_id===parent.application_id&&(!filter.status||filter.status==='all'||effective(r)===filter.status);});
      items.sort(function(a,b){return a.created_at<b.created_at?1:a.created_at>b.created_at?-1:a.credential_id<b.credential_id?-1:a.credential_id>b.credential_id?1:0;});
      var journals=tx.all_('OperationJournal');
      return page(items.map(function(r){return credentialDto(tx,r,parent,journals);}),filter,config,['status','page','page_size']);
    }
    if(op==='registry.credential.revoke'||op==='registry.credential.scopes'){
      exact(p,op==='registry.credential.scopes'?['credential_id','expected_revision','allowed_scopes','operation_id']:['credential_id','expected_revision','operation_id']);
      var row=credential(tx,p.credential_id);revision(row,p.expected_revision);
      var patch;
      if(op==='registry.credential.scopes'){requireCredentialActive(tx,row);patch={allowed_scopes:JSON.stringify(scopes(p.allowed_scopes))};}
      else patch={status:'revoked',revoked_at:row.revoked_at||SsoDbUtils.now()};
      var operation=start(tx,p.operation_id,op==='registry.credential.scopes'?'credential.scopes':'credential.revoke','credential',row.credential_id);
      try{
        var changed=tx.update('ApplicationCredentials',row.credential_id,patch);
        if(op==='registry.credential.revoke'){SpreadsheetApp.flush();props.deleteProperty('SSO_CLIENT_SECRET_'+row.key_id);}
        audit(tx,context.user,operation.operation_type,'credential',row.credential_id,operation.operation_id,Object.keys(patch));complete(tx,operation);
        return {credential:credentialDto(tx,changed,application(tx,row.application_id)),operation_id:operation.operation_id};
      }catch(e){failJournal(tx,operation);throw e;}
    }
    if(op==='registry.operation.get'){
      exact(p,['operation_id']);var entry=tx.findById('OperationJournal',id(p.operation_id,'Operation ID'));
      if(!entry||!/^application\.|^credential\./.test(entry.operation_type))SsoDbUtils.fail('NOT_FOUND','Operasi registry tidak ditemukan.');
      return {operation:{operation_id:entry.operation_id,operation_type:entry.operation_type,target_type:entry.target_type,target_id:entry.target_id,state:entry.state,created_at:entry.created_at,updated_at:entry.updated_at,error_code:entry.error_code}};
    }
    SsoDbUtils.fail('PERMISSION_DENIED','Operasi registry tidak diizinkan.');
  }
  return {supports_:supports_,execute_:execute_,validateApplication_:appInput};
})();

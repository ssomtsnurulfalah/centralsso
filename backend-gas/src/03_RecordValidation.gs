var SsoRecordValidation = (function () {
  var U = function () { return SsoDbUtils; };
  function bad(field) { U().fail('VALIDATION_ERROR','Nilai tidak valid: '+field); }
  function one(value, values, field) { if(values.indexOf(value)<0) bad(field); }
  function json(value, field) {
    if(typeof value !== 'string') bad(field);
    try { return JSON.parse(value); } catch(e) { bad(field); }
  }
  function iso(value, field) {
    if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
       !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) bad(field);
  }
  function check(name, record) {
    var s = U().spec(name);
    Object.keys(record).forEach(function(k){
      if(s.columns.indexOf(k)<0) bad(k);
      var v=record[k];
      var kind = ['identity_version','record_version','attempt_count'].indexOf(k)>=0 ? 'number' : k==='api_access_enabled' ? 'boolean' : 'string';
      if(v!=='' && typeof v!==kind) bad(k);
      if(typeof v !== 'string' && typeof v !== 'boolean' && typeof v !== 'number') bad(k);
      if(typeof v==='number' && !Number.isFinite(v)) bad(k);
      if(typeof v==='string' && (v.length>40000 || /[\u0000\u000b\u000c]/.test(v))) bad(k);
      if(v!=='' && (/_at$/.test(k) || ['timestamp','last_login','window_started_at','locked_until'].indexOf(k)>=0)) iso(v,k);
      if(v!=='' && ['identity_version','record_version','attempt_count'].indexOf(k)>=0 &&
        (!Number.isSafeInteger(v) || v< (k==='attempt_count'?0:1))) bad(k);
    });
    [s.id].concat(s.required).forEach(function(k){if(record[k] === '' || record[k] === undefined) bad(k);});
    if(typeof record[s.id]!=='string' || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(record[s.id])) bad(s.id);
    if(name==='Users') {
      if(record.username!==U().normalizeUsername(record.username)) bad('username');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) bad('email');
      if(typeof record.full_name!=='string' || !record.full_name.trim()) bad('full_name');
      one(record.status,['active','inactive','suspended'],'status');
      one(record.global_role,['super_admin','admin','user'],'global_role');
      one(record.password_algorithm,['scrypt'],'password_algorithm');
      if(!/^[0-9a-f]{128}$/.test(record.password_hash)) bad('password_hash');
      if(!/^[0-9a-f]{32}$/.test(record.password_salt)) bad('password_salt');
      var p=json(record.password_parameters,'password_parameters');
      if(!p || Array.isArray(p) || typeof p!=='object' || Object.keys(p).sort().join(',')!=='N,keylen,p,r' ||
         p.N!==131072 || p.r!==8 || p.p!==1 || p.keylen!==64) bad('password_parameters');
      if(record.archived_at && record.status==='active') bad('archived_at');
    }
    if(name==='Applications') {
      if(typeof record.application_url!=='string' || !/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?(?:[/?#][^\s\\]*)?$/i.test(record.application_url)) bad('application_url');
      one(record.application_status,['active','inactive'],'application_status');
      if(typeof record.api_access_enabled!=='boolean') bad('api_access_enabled');
    }
    if(name==='ApplicationCredentials') {
      one(record.status,['active','revoked','expired'],'status');
      var scopes=json(record.allowed_scopes,'allowed_scopes');
      if(!Array.isArray(scopes) || !scopes.length || scopes.some(function(x){return ['auth:verify','directory:read','user:status'].indexOf(x)<0;}) || new Set(scopes).size!==scopes.length) bad('allowed_scopes');
      if(!/^[0-9a-f]{64}$/.test(record.credential_fingerprint)) bad('credential_fingerprint');
      if(record.status==='revoked' && !record.revoked_at) bad('revoked_at');
    }
    if(['AuthenticationLogs','AuditLogs'].indexOf(name)>=0) {
      one(record.result,['success','failure'],'result');
      var m=json(record.metadata,'metadata');
      var allowed=['source','reason_code','changed_fields','operation_id','duration_ms'];
      if(!m || Array.isArray(m) || typeof m!=='object' || Object.keys(m).some(function(k){return allowed.indexOf(k)<0;})) bad('metadata');
      // Nilai metadata harus terstruktur dan terbatas; jangan memasukkan request/response mentah.
      Object.keys(m).forEach(function(k){
        if(k==='changed_fields') {
          if(!Array.isArray(m[k]) || m[k].length>30 || m[k].some(function(v){return typeof v!=='string' || !/^[a-z_]{1,64}$/.test(v);})) bad('metadata');
        } else if(k==='duration_ms') {
          if(!Number.isSafeInteger(m[k]) || m[k]<0) bad('metadata');
        } else if(typeof m[k]!=='string' || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(m[k])) bad('metadata');
      });
    }
    ['token_hash','session_token_hash','nonce_hash'].forEach(function(k){if(record[k]!==undefined && record[k]!=='' && !/^[0-9a-f]{64}$/.test(record[k])) bad(k);});
    if(name==='PasswordResetTokens' || name==='AuthenticationChallenges') {
      one(record.status,['active','used','revoked','expired'],'status');
      if(record.status==='used' && !(record.used_at || record.consumed_at)) bad('used_at/consumed_at');
    }
    if(name==='AuthenticationChallenges') one(record.purpose,['admin_login','user_verify'],'purpose');
    if(name==='OperationJournal') one(record.state,['pending','completed','failed','needs_reconciliation'],'state');
    if(record.expires_at && record.created_at && record.expires_at<=record.created_at) bad('expires_at');
    if(name==='AdminSessions' && (record.idle_expires_at>record.expires_at || record.idle_expires_at<=record.created_at)) bad('idle_expires_at');
    return record;
  }
  return {check:check};
})();

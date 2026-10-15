/** Central SSO V3.1 — skema database v1. Tidak bergantung pada urutan evaluasi file. */
var SsoSchema = (function () {
  function table(columns, options) {
    return Object.assign({columns: columns.split(' '), unique: [], refs: {}, required: []}, options || {});
  }
  var tables = {
    Users: table('user_id username full_name email password_hash password_salt password_algorithm password_parameters global_role status created_at updated_at last_login password_changed_at identity_version archived_at', {id:'user_id', unique:['user_id','username'], required:['username','full_name','email','password_hash','password_salt','password_algorithm','password_parameters','global_role','status','created_at','updated_at','password_changed_at','identity_version']}),
    Applications: table('application_id application_name application_description application_url application_type application_status api_access_enabled created_at updated_at record_version', {id:'application_id', unique:['application_id'], required:['application_name','application_url','application_type','application_status','api_access_enabled','created_at','updated_at','record_version']}),
    ApplicationCredentials: table('credential_id application_id credential_name key_id credential_fingerprint allowed_scopes status created_at expires_at rotated_at revoked_at', {id:'credential_id', unique:['credential_id','key_id'], refs:{application_id:'Applications'}, required:['application_id','credential_name','key_id','credential_fingerprint','allowed_scopes','status','created_at','expires_at']}),
    AuthenticationLogs: table('log_id timestamp user_id application_id result failure_reason_code request_id metadata', {id:'log_id', unique:['log_id'], refs:{user_id:'Users',application_id:'Applications'}, required:['timestamp','result','request_id','metadata']}),
    AuditLogs: table('audit_id timestamp actor_user_id action target_type target_id result metadata', {id:'audit_id', unique:['audit_id'], refs:{actor_user_id:'Users'}, required:['timestamp','action','target_type','target_id','result','metadata']}),
    PasswordResetTokens: table('reset_id user_id token_hash created_at expires_at used_at status', {id:'reset_id', unique:['reset_id','token_hash'], refs:{user_id:'Users'}, required:['user_id','token_hash','created_at','expires_at','status']}),
    AuthenticationRateLimits: table('rate_limit_id subject_key application_id attempt_count window_started_at locked_until updated_at', {id:'rate_limit_id', unique:['rate_limit_id'], compositeUnique:[['subject_key','application_id']], refs:{application_id:'Applications'}, required:['subject_key','attempt_count','window_started_at','updated_at']}),
    Settings: table('setting_key setting_value description updated_at', {id:'setting_key', unique:['setting_key'], required:['setting_value','updated_at']}),
    AdminSessions: table('session_id user_id session_token_hash created_at expires_at revoked_at last_activity_at identity_version idle_expires_at', {id:'session_id', unique:['session_id','session_token_hash'], refs:{user_id:'Users'}, required:['user_id','session_token_hash','created_at','expires_at','last_activity_at','identity_version','idle_expires_at']}),
    ReplayNonces: table('nonce_id principal_key nonce_hash request_id created_at expires_at', {id:'nonce_id', unique:['nonce_id'], compositeUnique:[['principal_key','nonce_hash']], required:['principal_key','nonce_hash','request_id','created_at','expires_at']}),
    AuthenticationChallenges: table('challenge_id user_id application_id purpose identity_version created_at expires_at consumed_at status', {id:'challenge_id', unique:['challenge_id'], refs:{user_id:'Users',application_id:'Applications'}, required:['user_id','purpose','identity_version','created_at','expires_at','status']}),
    OperationJournal: table('operation_id operation_type target_type target_id state created_at updated_at error_code', {id:'operation_id', unique:['operation_id'], required:['operation_type','target_type','target_id','state','created_at','updated_at']})
  };
  var defaults = {
    schema_version: ['1','Versi skema; perubahan memerlukan migrasi eksplisit.'],
    system_name: ['Central SSO','Nama sistem.'],
    institution_name: ['MTs Nurul Falah','Nama institusi; dapat diperbarui.'],
    display_timezone: ['Asia/Jakarta','Zona waktu tampilan; database tetap UTC.'],
    admin_session_absolute_seconds: ['28800','Batas absolut sesi administrator.'],
    admin_session_idle_seconds: ['1800','Batas tidak aktif sesi administrator.'],
    password_min_length: ['15','Panjang minimum password tanpa MFA.'],
    password_max_length: ['128','Batas karakter password; tidak boleh dipotong diam-diam.'],
    login_max_attempts: ['5','Nilai awal; implementasi pengendalian pada Tahap 3.'],
    login_window_seconds: ['900','Jendela penghitungan percobaan.'],
    login_lock_seconds: ['900','Durasi pembatasan awal.'],
    pagination_default: ['25','Jumlah hasil default.'],
    pagination_max: ['100','Batas maksimum hasil.'],
    reset_token_ttl_seconds: ['900','Masa berlaku token reset.'],
    request_clock_skew_seconds: ['60','Toleransi timestamp request bertanda tangan.']
  };
  return {version:'1', tables:tables, defaults:defaults};
})();

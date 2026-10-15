/** Layanan INTERNAL. Jangan kirim hasil Users/AdminSessions ke browser/API publik. */
var SsoDatabase = (function () {
  var prefixes = {Users:'usr',Applications:'app',ApplicationCredentials:'cred',AuthenticationLogs:'authlog',AuditLogs:'audit',PasswordResetTokens:'reset',AuthenticationRateLimits:'rate',AdminSessions:'ses',ReplayNonces:'nonce',AuthenticationChallenges:'challenge',OperationJournal:'op'};
  var appendOnly = ['AuthenticationLogs','AuditLogs'];
  function create_(spreadsheet, lockHeld) {
    var U=SsoDbUtils;
    function writeLock(fn) {return lockHeld ? fn() : U.withLock(fn);}
    function sheet(name) {
      var schema=U.spec(name), sh=spreadsheet.getSheetByName(name);
      if(!sh) U.fail('DATABASE_NOT_INITIALIZED','Sheet belum tersedia: '+name);
      U.assertHeader(sh,schema); return sh;
    }
    function raw(name) {
      var sh=sheet(name), cols=U.spec(name).columns, count=sh.getLastRow()-1;
      if(count<=0) return [];
      if(count>20000) U.fail('SCAN_LIMIT_EXCEEDED','Batas pembacaan 20.000 baris per sheet terlampaui; arsipkan atau migrasikan.');
      var width=Math.max(sh.getLastColumn(),cols.length);
      var range=sh.getRange(2,1,count,width), values=range.getValues(), formulas=range.getFormulas();
      return values.map(function(row,index){
        if(formulas[index].some(function(v){return v!=='';})) U.fail('DATA_INTEGRITY_ERROR','Formula ditemukan: '+name+' baris '+(index+2));
        if(row.slice(cols.length).some(function(v){return v!=='';})) U.fail('DATA_INTEGRITY_ERROR','Data di luar skema: '+name);
        if(row.slice(0,cols.length).every(function(v){return v==='';})) U.fail('DATA_INTEGRITY_ERROR','Baris kosong di tengah data: '+name+' baris '+(index+2));
        var item={}; cols.forEach(function(k,i){item[k]=U.decode(row[i]);});
        return {record:item,row:index+2};
      });
    }
    function records(name) { return raw(name).map(function(x){SsoRecordValidation.check(name,x.record);return x.record;}); }
    function checkSettings(r) {
      if(!Object.prototype.hasOwnProperty.call(SsoSchema.defaults,r.setting_key)) U.fail('VALIDATION_ERROR','Setting tidak diizinkan.');
      if(typeof r.setting_value!=='string') U.fail('VALIDATION_ERROR','Nilai setting harus teks.');
      var bounds={admin_session_absolute_seconds:[300,86400],admin_session_idle_seconds:[60,28800],password_min_length:[15,128],password_max_length:[128,1024],login_max_attempts:[1,20],login_window_seconds:[60,86400],login_lock_seconds:[60,86400],pagination_default:[1,100],pagination_max:[1,100],reset_token_ttl_seconds:[60,3600],request_clock_skew_seconds:[10,120]};
      var b=bounds[r.setting_key];
      if(b && (!/^\d+$/.test(r.setting_value) || +r.setting_value<b[0] || +r.setting_value>b[1])) U.fail('VALIDATION_ERROR','Setting di luar batas aman.');
      if(r.setting_key==='schema_version' && r.setting_value!==SsoSchema.version) U.fail('SCHEMA_MISMATCH','Migrasi skema diperlukan.');
      if(r.setting_key==='display_timezone' && ['Asia/Jakarta','Asia/Makassar','Asia/Jayapura','UTC'].indexOf(r.setting_value)<0) U.fail('VALIDATION_ERROR','Zona waktu belum didukung.');
    }
    function checkSet(name, items) {
      var schema=U.spec(name);
      items.forEach(function(r){SsoRecordValidation.check(name,r);if(name==='Settings') checkSettings(r);});
      schema.unique.map(function(k){return [k];}).concat(schema.compositeUnique||[]).forEach(function(keys){
        var seen=new Set();
        items.forEach(function(r){
          var values=keys.map(function(k){return r[k];});
          if(keys.length===1 && values[0]==='') return;
          var key=JSON.stringify(values);
          if(seen.has(key)) U.fail('DUPLICATE_RECORD','Nilai unik duplikat: '+name+'.'+keys.join('+'));
          seen.add(key);
        });
      });
      Object.keys(schema.refs).forEach(function(field){
        var target=schema.refs[field], id=U.spec(target).id;
        var ids=new Set(records(target).map(function(r){return r[id];}));
        items.forEach(function(r){if(r[field] && !ids.has(r[field])) U.fail('INVALID_REFERENCE','Referensi tidak ditemukan: '+name+'.'+field);});
      });
      if(name==='Settings') {
        var values={};items.forEach(function(r){values[r.setting_key]=r.setting_value;});
        [['pagination_default','pagination_max'],['password_min_length','password_max_length'],['admin_session_idle_seconds','admin_session_absolute_seconds']].forEach(function(pair){
          if(values[pair[0]]!==undefined && values[pair[1]]!==undefined && +values[pair[0]]>+values[pair[1]]) U.fail('VALIDATION_ERROR','Relasi pengaturan tidak valid.');
        });
      }
    }
    function build(name,input) {
      if(!input || typeof input!=='object' || Array.isArray(input)) U.fail('VALIDATION_ERROR','Record harus objek.');
      var schema=U.spec(name), r={}, now=U.now();
      Object.keys(input).forEach(function(k){if(schema.columns.indexOf(k)<0) U.fail('VALIDATION_ERROR','Kolom tidak diizinkan: '+k);});
      schema.columns.forEach(function(k){r[k]=Object.prototype.hasOwnProperty.call(input,k)?input[k]:'';});
      // UUID hanya untuk ID record publik/non-rahasia, bukan token atau secret.
      if(!r[schema.id] && name!=='Settings') r[schema.id]=prefixes[name]+'_'+Utilities.getUuid();
      ['created_at','updated_at','timestamp'].forEach(function(k){if(schema.columns.indexOf(k)>=0 && !r[k])r[k]=now;});
      if(name==='Users') {r.username=U.normalizeUsername(r.username);if(!Object.prototype.hasOwnProperty.call(input,'identity_version'))r.identity_version=1;if(!r.password_changed_at)r.password_changed_at=now;}
      if(name==='Applications' && !Object.prototype.hasOwnProperty.call(input,'record_version')) r.record_version=1;
      return r;
    }
    function write(name,start,items) {
      var sh=sheet(name), cols=U.spec(name).columns;
      U.ensureRows(sh,start+items.length-1);
      sh.getRange(start,1,items.length,cols.length).setValues(items.map(function(r){return cols.map(function(k){return U.encode(r[k]);});}));
    }
    function insertMany(name,inputs) {
      if(!Array.isArray(inputs) || !inputs.length || inputs.length>100) U.fail('VALIDATION_ERROR','Batch harus 1–100 record.');
      return writeLock(function(){
        var current=records(name), added=inputs.map(function(r){return build(name,r);});
        if(current.length+added.length>20000) U.fail('SCAN_LIMIT_EXCEEDED','Batas baris database terlampaui.');
        checkSet(name,current.concat(added));
        write(name,sheet(name).getLastRow()+1,added);
        return added;
      });
    }
    function update(name,id,patch,expectedVersion) {
      if(appendOnly.indexOf(name)>=0) U.fail('APPEND_ONLY','Log tidak boleh diubah.');
      if(!patch || typeof patch!=='object' || Array.isArray(patch)) U.fail('VALIDATION_ERROR','Patch harus objek.');
      return writeLock(function(){
        var s=U.spec(name), rows=raw(name), at=rows.findIndex(function(x){return x.record[s.id]===id;});
        if(at<0) U.fail('NOT_FOUND','Record tidak ditemukan.');
        var old=rows[at].record;
        var versionField=name==='Users'?'identity_version':name==='Applications'?'record_version':null;
        var immutable=[s.id,'created_at'];
        if(name==='ApplicationCredentials') immutable=immutable.concat(['application_id','key_id','credential_fingerprint']);
        if(versionField) immutable.push(versionField);
        if(Object.keys(patch).some(function(k){return immutable.indexOf(k)>=0 || s.columns.indexOf(k)<0;})) U.fail('IMMUTABLE_FIELD','Kolom permanen atau tidak dikenal tidak dapat diubah.');
        if(name==='Settings' && id==='schema_version') U.fail('IMMUTABLE_FIELD','Versi skema hanya diubah melalui migrasi.');
        if(versionField && (!Number.isSafeInteger(expectedVersion) || expectedVersion!==old[versionField])) U.fail('VERSION_CONFLICT','Data telah berubah; muat ulang.');
        var next=Object.assign({},old,patch);
        if(name==='Users') next.username=U.normalizeUsername(next.username);
        if(versionField) next[versionField]=old[versionField]+1;
        if(s.columns.indexOf('updated_at')>=0) next.updated_at=U.now();
        var items=rows.map(function(x){return x.record;});
        if(name==='Users' && old.global_role==='super_admin' && old.status==='active' && !old.archived_at &&
          (next.global_role!=='super_admin' || next.status!=='active' || next.archived_at) &&
          items.filter(function(r){return r.global_role==='super_admin' && r.status==='active' && !r.archived_at;}).length<=1)
          U.fail('LAST_SUPER_ADMIN','Super Admin aktif terakhir harus dipertahankan.');
        items[at]=next;checkSet(name,items);
        if(name==='Users'){
          // Cabut link reset versi identitas lama SEBELUM menulis versi baru.
          // Kegagalan parsial tidak boleh menyisakan link lama setelah perubahan.
          var resets=raw('PasswordResetTokens').filter(function(x){SsoRecordValidation.check('PasswordResetTokens',x.record);return x.record.user_id===id&&x.record.status==='active';});
          resets.forEach(function(x){var revoked=Object.assign({},x.record,{status:'revoked'});SsoRecordValidation.check('PasswordResetTokens',revoked);write('PasswordResetTokens',x.row,[revoked]);});
          if(resets.length)SpreadsheetApp.flush();
        }
        write(name,rows[at].row,[next]);return next;
      });
    }
    function findById(name,id) {
      var schema=U.spec(name), items=records(name).filter(function(r){return r[schema.id]===id;});
      if(items.length>1) U.fail('DATA_INTEGRITY_ERROR','ID duplikat.');
      return items[0]||null;
    }
    function list(name,options) {
      var schema=U.spec(name), o=options||{}, page=o.page===undefined?1:o.page, size=o.pageSize===undefined?25:o.pageSize;
      if(!Number.isSafeInteger(page)||page<1||page>1000000||!Number.isSafeInteger(size)||size<1||size>100) U.fail('VALIDATION_ERROR','Pagination tidak valid.');
      var items=records(name), filters=o.filters||{};
      if(!filters || typeof filters!=='object' || Array.isArray(filters)) U.fail('VALIDATION_ERROR','Filter tidak valid.');
      Object.keys(filters).forEach(function(k){if(schema.columns.indexOf(k)<0) U.fail('VALIDATION_ERROR','Filter tidak dikenal.');items=items.filter(function(r){return r[k]===filters[k];});});
      if(o.query!==undefined) {
        if(typeof o.query!=='string'||o.query.length>200) U.fail('VALIDATION_ERROR','Pencarian tidak valid.');
        var searchable=name==='Users'?['username','full_name']:name==='Applications'?['application_name']:[];
        if(!searchable.length) U.fail('VALIDATION_ERROR','Pencarian teks tidak diizinkan pada sheet ini.');
        var q=o.query.toLowerCase();items=items.filter(function(r){return searchable.some(function(k){return r[k].toLowerCase().indexOf(q)>=0;});});
      }
      var sort=o.sortBy||schema.id;
      if(schema.columns.indexOf(sort)<0 || (o.direction!==undefined && ['asc','desc'].indexOf(o.direction)<0)) U.fail('VALIDATION_ERROR','Sorting tidak valid.');
      var factor=o.direction==='desc'?-1:1;
      items.sort(function(a,b){var cmp=a[sort]<b[sort]?-1:a[sort]>b[sort]?1:0;return factor*(cmp || (a[schema.id]<b[schema.id]?-1:a[schema.id]>b[schema.id]?1:0));});
      return {items:items.slice((page-1)*size,page*size),total:items.length,page:page,page_size:size};
    }
    function validateIntegrity() {
      return writeLock(function(){
        var results=[];
        Object.keys(SsoSchema.tables).forEach(function(name){
          try {var items=records(name);checkSet(name,items);results.push({sheet:name,status:'PASS',records:items.length});}
          catch(e){results.push({sheet:name,status:'FAIL',code:e.code||'INTERNAL_ERROR',message:e.message});}
        });
        return {success:results.every(function(x){return x.status==='PASS';}),schema_version:SsoSchema.version,results:results};
      });
    }
    function atomic_(fn) {
      if(lockHeld) U.fail('NESTED_TRANSACTION','Jangan membuat lock bersarang.');
      return U.withLock(function(){return fn(create_(spreadsheet,true));});
    }
    function touchLastLogin_(id, expectedVersion, timestamp) {
      if(!lockHeld) U.fail('LOCK_REQUIRED','Operasi login memerlukan atomic_.');
      var rows=raw('Users'), at=rows.findIndex(function(x){return x.record.user_id===id;});
      if(at<0 || rows[at].record.identity_version!==expectedVersion) U.fail('VERSION_CONFLICT','Identitas berubah.');
      var next=Object.assign({},rows[at].record,{last_login:timestamp,updated_at:timestamp});
      SsoRecordValidation.check('Users',next);write('Users',rows[at].row,[next]);return next;
    }
    function pruneExpired_(name, before, limit) {
      if(!lockHeld) U.fail('LOCK_REQUIRED','Pembersihan memerlukan atomic_.');
      if(['ReplayNonces','AuthenticationChallenges','AdminSessions','PasswordResetTokens'].indexOf(name)<0 || !Number.isFinite(Date.parse(before)) || !Number.isSafeInteger(limit) || limit<1 || limit>500) U.fail('VALIDATION_ERROR','Pembersihan tidak diizinkan.');
      var expired=raw(name).filter(function(x){SsoRecordValidation.check(name,x.record);return x.record.expires_at && x.record.expires_at<=before;}).slice(0,limit);
      var indices=expired.map(function(x){return x.row;}).sort(function(a,b){return b-a;}), sh=sheet(name), removed=0;
      while(indices.length) {
        var top=indices.shift(), low=top;
        while(indices.length && indices[0]===low-1)low=indices.shift();
        sh.deleteRows(low,top-low+1);removed+=top-low+1;
      }
      return removed;
    }
    function pruneRateLimits_(limit){
      if(!lockHeld)U.fail('LOCK_REQUIRED','Pembersihan memerlukan atomic_.');
      if(!Number.isSafeInteger(limit)||limit<1||limit>500)U.fail('VALIDATION_ERROR','Batas cleanup tidak valid.');
      // Maksimum login window/lock 24 jam. Retensi 48 jam dan lock yang sudah
      // berakhir tidak dapat menghapus counter yang masih melindungi request.
      var cutoff=new Date(Date.now()-2*86400000).toISOString(),now=U.now();
      var rows=raw('AuthenticationRateLimits').filter(function(x){SsoRecordValidation.check('AuthenticationRateLimits',x.record);return x.record.updated_at<=cutoff&&(!x.record.locked_until||x.record.locked_until<=now);}).slice(0,limit);
      var indices=rows.map(function(x){return x.row;}).sort(function(a,b){return b-a;}),sh=sheet('AuthenticationRateLimits'),removed=0;
      while(indices.length){var top=indices.shift(),low=top;while(indices.length&&indices[0]===low-1)low=indices.shift();sh.deleteRows(low,top-low+1);removed+=top-low+1;}
      return removed;
    }
    return {pruneRateLimits_:pruneRateLimits_,pruneExpired_:pruneExpired_,atomic_:atomic_,all_:records,touchLastLogin_:touchLastLogin_,insert:function(n,r){return insertMany(n,[r])[0];},insertMany:insertMany,update:update,findById:findById,list:list,validateIntegrity:validateIntegrity};
  }
  function configured_() {return create_(SsoDbUtils.openConfigured());}
  return {create_:create_,configured_:configured_};
})();

var SsoUserDirectory = (function () {
  var operations=['directory.search','directory.get','user.status'];
  function validateInput_(op,p,config) {
    var U=SsoDbUtils;
    if(!p||typeof p!=='object'||Array.isArray(p))U.fail('VALIDATION_ERROR','Payload tidak valid.');
    if(op==='directory.search') {
      var fields=['query','status','page','page_size','sort_by','sort_direction'];
      if(Object.keys(p).some(function(k){return fields.indexOf(k)<0;}))U.fail('VALIDATION_ERROR','Field pencarian tidak diizinkan.');
      var query=p.query===undefined?'':p.query,status=p.status===undefined?'active':p.status;
      var page=p.page===undefined?1:p.page,size=p.page_size===undefined?config.pagination_default:p.page_size;
      var sort=p.sort_by===undefined?'username':p.sort_by,direction=p.sort_direction===undefined?'asc':p.sort_direction;
      if(typeof query!=='string'||Array.from(query).length>100||/[\u0000-\u001f\u007f]/.test(query)||['active','inactive','suspended','all'].indexOf(status)<0||!Number.isSafeInteger(page)||page<1||page>1000000||!Number.isSafeInteger(size)||size<1||size>config.pagination_max||['username','full_name','sso_user_id'].indexOf(sort)<0||['asc','desc'].indexOf(direction)<0)U.fail('VALIDATION_ERROR','Parameter pencarian tidak valid.');
      return {query:query.trim().toLowerCase(),status:status,page:page,page_size:size,sort_by:sort==='sso_user_id'?'user_id':sort,sort_direction:direction};
    }
    if(op==='directory.get'||op==='user.status') {
      SsoRequestSecurity.exact(p,['user_id']);
      if(typeof p.user_id!=='string'||! /^[a-zA-Z0-9_.:-]{1,160}$/.test(p.user_id))U.fail('VALIDATION_ERROR','User ID tidak valid.');
      return p;
    }
    U.fail('PERMISSION_DENIED','Operasi direktori tidak diizinkan.');
  }
  function consumeRate_(tx,props,application) {
    var U=SsoDbUtils,now=Date.now(),subject=SsoRequestSecurity.hmac('directory:'+application,props.getProperty('SSO_RATE_LIMIT_SECRET'));
    var found=tx.list('AuthenticationRateLimits',{filters:{subject_key:subject,application_id:application},pageSize:1});
    if(found.total>1)U.fail('DATA_INTEGRITY_ERROR','Counter direktori duplikat.');
    var old=found.items[0],reset=!old||now-Date.parse(old.window_started_at)>=60000;
    if(old&&!reset&&old.attempt_count>=120)U.fail('RATE_LIMITED','Batas permintaan direktori tercapai.');
    var count=reset?1:old.attempt_count+1,start=reset?U.now():old.window_started_at;
    var patch={subject_key:subject,application_id:application,attempt_count:count,window_started_at:start,locked_until:count>=120?new Date(Date.parse(start)+60000).toISOString():''};
    if(old)tx.update('AuthenticationRateLimits',old.rate_limit_id,patch);else tx.insert('AuthenticationRateLimits',patch);
  }
  function identity_(user) {
    return {sso_user_id:user.user_id,username:user.username,full_name:user.full_name,account_status:user.status,identity_version:user.identity_version};
  }
  function users_(tx) {
    var rows=tx.all_('Users'),ids=new Set(),names=new Set();
    rows.forEach(function(r){if(ids.has(r.user_id)||names.has(r.username))SsoDbUtils.fail('DATA_INTEGRITY_ERROR','Identitas pengguna duplikat.');ids.add(r.user_id);names.add(r.username);});
    return rows;
  }
  function execute_(tx,props,client,config) {
    var U=SsoDbUtils,S=SsoRequestSecurity;
    if(!client||operations.indexOf(client.op)<0)U.fail('PERMISSION_DENIED','Operasi direktori tidak diizinkan.');
    SsoClientAuthentication.validate_(tx,props,client,config.request_clock_skew_seconds,true,client.op);
    consumeRate_(tx,props,client.application_id);
    var p=validateInput_(client.op,S.payload(client),config),stamp=U.now();
    // Snapshot dibaca saat lock masih dipegang. Data internal tidak diserialisasi langsung.
    var rows=users_(tx);
    if(client.op==='directory.search') {
      rows=rows.filter(function(r){return !r.archived_at&&(p.status==='all'||r.status===p.status)&&(!p.query||r.username.toLowerCase().indexOf(p.query)>=0||r.full_name.toLowerCase().indexOf(p.query)>=0);});
      var factor=p.sort_direction==='desc'?-1:1;
      rows.sort(function(a,b){var av=a[p.sort_by].toLowerCase(),bv=b[p.sort_by].toLowerCase();return factor*((av<bv?-1:av>bv?1:0)||(a.user_id<b.user_id?-1:a.user_id>b.user_id?1:0));});
      var pages=Math.ceil(rows.length/p.page_size),start=(p.page-1)*p.page_size;
      return {items:rows.slice(start,start+p.page_size).map(identity_),pagination:{page:p.page,page_size:p.page_size,total:rows.length,total_pages:pages,has_next:p.page<pages},request_id:client.request_id,retrieved_at:stamp};
    }
    var user=rows.find(function(r){return r.user_id===p.user_id;});
    if(!user||(client.op==='directory.get'&&user.archived_at))U.fail('NOT_FOUND','Pengguna tidak ditemukan.');
    if(client.op==='directory.get')return {user:identity_(user),request_id:client.request_id,retrieved_at:stamp};
    return {sso_user_id:user.user_id,account_status:user.status,is_archived:!!user.archived_at,can_authenticate:user.status==='active'&&!user.archived_at,identity_version:user.identity_version,checked_at:stamp,request_id:client.request_id};
  }
  return {execute_:execute_,validateInput_:validateInput_};
})();

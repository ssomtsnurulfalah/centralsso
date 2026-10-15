import {frame,decode} from './protocol.mjs';
if(typeof window!=='undefined')throw new Error('Modul direktori hanya boleh dipakai di server.');
const operations={searchUsers:'directory.search',getUserById:'directory.get',getUserStatus:'user.status'};
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
const isStatus=value=>['active','inactive','suspended'].includes(value);
function fail(code='SERVICE_UNAVAILABLE'){throw Object.assign(new Error(code==='VALIDATION_ERROR'?'Payload direktori tidak valid.':'Respons direktori tidak valid.'),{code});}
export function validateDirectoryInput(op,p){
  if(!p||typeof p!=='object'||Array.isArray(p))fail('VALIDATION_ERROR');
  if(op==='directory.search'){
    const allowed=['query','status','page','page_size','sort_by','sort_direction'];
    if(Object.keys(p).some(k=>!allowed.includes(k))||
      (p.query!==undefined&&(typeof p.query!=='string'||Array.from(p.query).length>100||/[\u0000-\u001f\u007f]/.test(p.query)))||
      (p.status!==undefined&&!['active','inactive','suspended','all'].includes(p.status))||
      (p.page!==undefined&&(!Number.isSafeInteger(p.page)||p.page<1||p.page>1000000))||
      (p.page_size!==undefined&&(!Number.isSafeInteger(p.page_size)||p.page_size<1||p.page_size>100))||
      (p.sort_by!==undefined&&!['username','full_name','sso_user_id'].includes(p.sort_by))||
      (p.sort_direction!==undefined&&!['asc','desc'].includes(p.sort_direction)))fail('VALIDATION_ERROR');
  }else if(op==='directory.get'||op==='user.status'){
    if(Object.keys(p).join(',')!=='user_id'||!validId(p.user_id))fail('VALIDATION_ERROR');
  }else fail('PERMISSION_DENIED');
  return p;
}
function identity(value){
  if(!value||!validId(value.sso_user_id)||typeof value.username!=='string'||!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(value.username)||typeof value.full_name!=='string'||!value.full_name.trim()||value.full_name.length>40000||!isStatus(value.account_status)||!Number.isSafeInteger(value.identity_version)||value.identity_version<1)fail();
  return {sso_user_id:value.sso_user_id,username:value.username,full_name:value.full_name,account_status:value.account_status,identity_version:value.identity_version};
}
function timestamp(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail();return value;}
function project(method,result,input,request){
  if(!result||result.request_id!==request)fail();
  if(method==='getUserStatus'){
    if(result.sso_user_id!==input.user_id||!isStatus(result.account_status)||typeof result.is_archived!=='boolean'||typeof result.can_authenticate!=='boolean'||(result.is_archived&&result.account_status==='active')||result.can_authenticate!==(result.account_status==='active'&&!result.is_archived)||!Number.isSafeInteger(result.identity_version)||result.identity_version<1)fail();
    return {sso_user_id:result.sso_user_id,account_status:result.account_status,is_archived:result.is_archived,can_authenticate:result.can_authenticate,identity_version:result.identity_version,checked_at:timestamp(result.checked_at),request_id:request};
  }
  const stamp=timestamp(result.retrieved_at);
  if(method==='getUserById'){
    const user=identity(result.user);if(user.sso_user_id!==input.user_id)fail();
    return {user,request_id:request,retrieved_at:stamp};
  }
  const p=result.pagination;
  if(!p||!Number.isSafeInteger(p.page)||p.page!==(input.page??1)||!Number.isSafeInteger(p.page_size)||p.page_size<1||p.page_size>100||(input.page_size!==undefined&&p.page_size!==input.page_size)||!Number.isSafeInteger(p.total)||p.total<0||p.total>20000||p.total_pages!==Math.ceil(p.total/p.page_size)||p.has_next!==(p.page<p.total_pages)||!Array.isArray(result.items)||result.items.length!==Math.min(p.page_size,Math.max(0,p.total-(p.page-1)*p.page_size)))fail();
  const items=result.items.map(identity),ids=new Set(items.map(user=>user.sso_user_id));
  if(ids.size!==items.length||items.some(user=>input.status!=='all'&&user.account_status!==(input.status??'active')))fail();
  return {items,pagination:{page:p.page,page_size:p.page_size,total:p.total,total_pages:p.total_pages,has_next:p.has_next},request_id:request,retrieved_at:stamp};
}
export function createUserDirectory(call){
  const service={};
  for(const [method,operation]of Object.entries(operations))service[method]=async function(envelope){
    frame(envelope,'central-sso-app');
    if(envelope.op!==operation)fail('PERMISSION_DENIED');
    const input=validateDirectoryInput(operation,decode(envelope));
    return project(method,await call('directory.execute',{client:envelope}),input,envelope.request_id);
  };
  return service;
}

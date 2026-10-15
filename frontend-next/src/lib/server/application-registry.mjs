import {randomUUID} from 'node:crypto';
import {secret,digest} from './password.mjs';
if(typeof window!=='undefined')throw new Error('Registry hanya boleh dipakai di server.');
const ids=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(v);
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const statuses=['active','inactive'];
const scopeNames=['auth:verify','directory:read','user:status'];
const appFields=['application_name','application_description','application_url','application_type','application_status','api_access_enabled'];
function fail(code='VALIDATION_ERROR'){throw Object.assign(new Error(code==='VALIDATION_ERROR'?'Data registry tidak valid.':'Respons registry tidak valid.'),{code});}
function exact(value,fields,required=fields){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k))||required.some(k=>!Object.hasOwn(value,k)))fail();return value;}
function text(v,min,max){return typeof v==='string'&&v.trim().length>=min&&Array.from(v).length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);}
function timestamp(v,empty=false){if(empty&&v==='')return v;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)fail('SERVICE_UNAVAILABLE');return v;}
function url(v){if(typeof v!=='string'||v.length>2048)return false;const m=/^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?(?:[/?#][^\s\\]*)?$/i.exec(v);return !!m&&(!m[2]||(+m[2]>=1&&+m[2]<=65535))&&m[1].split('.').every(s=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(s));}
export function validateApplication(input,partial=false){
  exact(input,appFields,partial?[]:appFields);if(partial&&!Object.keys(input).length)fail();
  for(const [k,v]of Object.entries(input)){
    const ok=k==='application_name'?text(v,1,160):k==='application_description'?text(v,0,2000):k==='application_url'?url(v):k==='application_type'?typeof v==='string'&&/^[a-z][a-z0-9_-]{1,31}$/.test(v):k==='application_status'?statuses.includes(v):typeof v==='boolean';
    if(!ok)fail();
  }
  return input;
}
function scopes(value){if(!Array.isArray(value)||!value.length||value.length>3||new Set(value).size!==value.length||value.some(v=>!scopeNames.includes(v)))fail();return value;}
function options(input,partial=false){
  exact(input,['credential_name','allowed_scopes','expires_in_seconds'],partial?[]:['credential_name','allowed_scopes']);
  if(input.credential_name!==undefined&&!text(input.credential_name,1,120))fail();
  if(input.allowed_scopes!==undefined)scopes(input.allowed_scopes);
  if(input.expires_in_seconds!==undefined&&(!Number.isSafeInteger(input.expires_in_seconds)||input.expires_in_seconds<300||input.expires_in_seconds>31536000))fail();
  return input;
}
function appDto(r){
  if(!r||!ids(r.application_id)||!Number.isSafeInteger(r.record_version)||r.record_version<1)fail('SERVICE_UNAVAILABLE');
  const fields={};for(const k of appFields)fields[k]=r[k];
  try{validateApplication(fields);}catch{fail('SERVICE_UNAVAILABLE');}
  return {application_id:r.application_id,...fields,created_at:timestamp(r.created_at),updated_at:timestamp(r.updated_at),record_version:r.record_version};
}
function credentialDto(r){
  if(!r||!ids(r.credential_id)||!ids(r.application_id)||!text(r.credential_name,1,120)||typeof r.key_id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(r.key_id)||!hex(r.credential_fingerprint)||!hex(r.revision)||!['active','expired','revoked'].includes(r.status)||!['active','expired','revoked'].includes(r.effective_status)||typeof r.lifecycle_committed!=='boolean'||typeof r.usable!=='boolean'||(r.usable&&(r.effective_status!=='active'||!r.lifecycle_committed)))fail('SERVICE_UNAVAILABLE');
  try{scopes(r.allowed_scopes);}catch{fail('SERVICE_UNAVAILABLE');}
  const out={credential_id:r.credential_id,application_id:r.application_id,credential_name:r.credential_name,key_id:r.key_id,credential_fingerprint:r.credential_fingerprint,allowed_scopes:[...r.allowed_scopes],status:r.status,effective_status:r.effective_status,lifecycle_committed:r.lifecycle_committed,usable:r.usable,created_at:timestamp(r.created_at),expires_at:timestamp(r.expires_at),rotated_at:timestamp(r.rotated_at,true),revoked_at:timestamp(r.revoked_at,true),revision:r.revision};
  if((out.status==='revoked'||out.revoked_at)&&out.effective_status!=='revoked'||out.status==='expired'&&!out.revoked_at&&out.effective_status!=='expired'||out.expires_at<=out.created_at||(out.effective_status==='revoked'&&out.status!=='revoked'&&!out.revoked_at))fail('SERVICE_UNAVAILABLE');
  return out;
}
function paged(result,input,mapper){
  const p=result?.pagination;if(!p||!Number.isSafeInteger(p.page)||p.page!==(input.page??1)||!Number.isSafeInteger(p.page_size)||p.page_size<1||p.page_size>100||(input.page_size!==undefined&&p.page_size!==input.page_size)||!Number.isSafeInteger(p.total)||p.total<0||p.total>20000||p.total_pages!==Math.ceil(p.total/p.page_size)||p.has_next!==(p.page<p.total_pages)||!Array.isArray(result.items)||result.items.length!==Math.min(p.page_size,Math.max(0,p.total-(p.page-1)*p.page_size)))fail('SERVICE_UNAVAILABLE');
  return {items:result.items.map(mapper),pagination:{page:p.page,page_size:p.page_size,total:p.total,total_pages:p.total_pages,has_next:p.has_next}};
}
function filters(input,credentials=false){exact(input,credentials?['status','page','page_size']:['status','query','page','page_size'],[]);if(input.status!==undefined&&!(credentials?['active','revoked','expired','all']:['active','inactive','all']).includes(input.status))fail();if(input.query!==undefined&&!text(input.query,0,100))fail();if(input.page!==undefined&&(!Number.isSafeInteger(input.page)||input.page<1||input.page>1000000))fail();if(input.page_size!==undefined&&(!Number.isSafeInteger(input.page_size)||input.page_size<1||input.page_size>100))fail();return input;}
function operationDto(r){if(!r||!ids(r.operation_id)||typeof r.operation_type!=='string'||!/^(application|credential)\.[a-z]+$/.test(r.operation_type)||!['application','credential','credential_key'].includes(r.target_type)||!ids(r.target_id)||!['pending','completed','failed','needs_reconciliation'].includes(r.state)||typeof r.error_code!=='string'||!/^[A-Z_]*$/.test(r.error_code))fail('SERVICE_UNAVAILABLE');return {operation_id:r.operation_id,operation_type:r.operation_type,target_type:r.target_type,target_id:r.target_id,state:r.state,created_at:timestamp(r.created_at),updated_at:timestamp(r.updated_at),error_code:r.error_code};}
export function createApplicationRegistry(call){
  async function rpc(token,op,payload){if(!hex(token))throw Object.assign(new Error('Sesi tidak valid.'),{code:'UNAUTHENTICATED'});return call(op,{session_token_hash:digest(token),...payload});}
  async function mutation(token,op,payload,operationId){
    const operation=operationId??'op_'+randomUUID();if(!ids(operation))fail();
    try{const result=await rpc(token,op,{...payload,operation_id:operation});if(result?.operation_id!==operation)fail('SERVICE_UNAVAILABLE');
      if(op.startsWith('registry.app.')){const a=appDto(result.application);if(payload.application_id&&(a.application_id!==payload.application_id||a.record_version!==payload.expected_version+1))fail('SERVICE_UNAVAILABLE');if(op==='registry.app.disable'&&a.application_status!=='inactive')fail('SERVICE_UNAVAILABLE');}
      if(op.startsWith('registry.credential.')){const c=credentialDto(result.credential);if(['registry.credential.revoke','registry.credential.scopes'].includes(op)&&c.credential_id!==payload.credential_id)fail('SERVICE_UNAVAILABLE');if(op==='registry.credential.revoke'&&(c.effective_status!=='revoked'||c.usable))fail('SERVICE_UNAVAILABLE');if(op==='registry.credential.scopes'&&c.allowed_scopes.slice().sort().join(',')!==payload.allowed_scopes.slice().sort().join(','))fail('SERVICE_UNAVAILABLE');}
      return result;}
    catch(e){e.operation_id=operation;throw e;}
  }
  async function issue(token,rotating,target,expectedRevision,input,operationId){
    if(!ids(target))fail();if(rotating&&!hex(expectedRevision))fail();options(input,rotating);
    const keyId='key_'+randomUUID().replaceAll('-',''),newSecret=secret();
    const payload={options:input,key_id:keyId,secret:newSecret,...rotating?{credential_id:target,expected_revision:expectedRevision}:{application_id:target}};
    const result=await mutation(token,rotating?'registry.credential.rotate':'registry.credential.issue',payload,operationId);
    try{
      const credential=credentialDto(result.credential);
      if(credential.key_id!==keyId||credential.credential_fingerprint!==digest(newSecret)||!credential.lifecycle_committed||!credential.usable||(!rotating&&credential.application_id!==target)||result.previous_credential_id!==(rotating?target:null))fail('SERVICE_UNAVAILABLE');
      return {credential,operation_id:result.operation_id,previous_credential_id:result.previous_credential_id,client_secret:newSecret};
    }catch(e){e.operation_id=result.operation_id;throw e;}
  }
  return {
    async listApplications(token,input={}){filters(input);return paged(await rpc(token,'registry.app.list',{filters:input}),input,appDto);},
    async getApplication(token,applicationId){if(!ids(applicationId))fail();const r=appDto((await rpc(token,'registry.app.get',{application_id:applicationId})).application);if(r.application_id!==applicationId)fail('SERVICE_UNAVAILABLE');return {application:r};},
    async createApplication(token,input,operationId){exact(input,appFields,['application_name','application_url']);const application={application_description:'',application_type:'web',application_status:'inactive',api_access_enabled:false,...input};validateApplication(application);const r=await mutation(token,'registry.app.create',{application},operationId);return {application:appDto(r.application),operation_id:r.operation_id};},
    async updateApplication(token,applicationId,expectedVersion,patch,operationId){if(!ids(applicationId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)fail();validateApplication(patch,true);const r=await mutation(token,'registry.app.update',{application_id:applicationId,expected_version:expectedVersion,patch},operationId),application=appDto(r.application);if(application.application_id!==applicationId||application.record_version!==expectedVersion+1)fail('SERVICE_UNAVAILABLE');return {application,operation_id:r.operation_id};},
    async disableApplication(token,applicationId,expectedVersion,operationId){if(!ids(applicationId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)fail();const r=await mutation(token,'registry.app.disable',{application_id:applicationId,expected_version:expectedVersion},operationId),application=appDto(r.application);if(application.application_id!==applicationId||application.application_status!=='inactive'||application.record_version!==expectedVersion+1)fail('SERVICE_UNAVAILABLE');return {application,operation_id:r.operation_id};},
    async listCredentials(token,applicationId,input={}){if(!ids(applicationId))fail();filters(input,true);const r=paged(await rpc(token,'registry.credential.list',{application_id:applicationId,filters:input}),input,credentialDto);if(r.items.some(v=>v.application_id!==applicationId))fail('SERVICE_UNAVAILABLE');return r;},
    async getCredential(token,credentialId){if(!ids(credentialId))fail();const credential=credentialDto((await rpc(token,'registry.credential.get',{credential_id:credentialId})).credential);if(credential.credential_id!==credentialId)fail('SERVICE_UNAVAILABLE');return {credential};},
    generateClientCredential(token,applicationId,input,operationId){return issue(token,false,applicationId,null,input,operationId);},
    rotateClientCredential(token,credentialId,expectedRevision,input={},operationId){return issue(token,true,credentialId,expectedRevision,input,operationId);},
    async revokeClientCredential(token,credentialId,expectedRevision,operationId){if(!ids(credentialId)||!hex(expectedRevision))fail();const r=await mutation(token,'registry.credential.revoke',{credential_id:credentialId,expected_revision:expectedRevision},operationId),credential=credentialDto(r.credential);if(credential.credential_id!==credentialId||credential.effective_status!=='revoked'||credential.usable)fail('SERVICE_UNAVAILABLE');return {credential,operation_id:r.operation_id};},
    async updateCredentialScopes(token,credentialId,expectedRevision,list,operationId){if(!ids(credentialId)||!hex(expectedRevision))fail();scopes(list);const r=await mutation(token,'registry.credential.scopes',{credential_id:credentialId,expected_revision:expectedRevision,allowed_scopes:list},operationId),credential=credentialDto(r.credential);if(credential.credential_id!==credentialId||credential.allowed_scopes.slice().sort().join(',')!==list.slice().sort().join(','))fail('SERVICE_UNAVAILABLE');return {credential,operation_id:r.operation_id};},
    async getOperationStatus(token,operationId){if(!ids(operationId))fail();const operation=operationDto((await rpc(token,'registry.operation.get',{operation_id:operationId})).operation);if(operation.operation_id!==operationId)fail('SERVICE_UNAVAILABLE');return {operation};}
  };
}

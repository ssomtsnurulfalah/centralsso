/** Uji lifecycle nyata pada development saja. Membuat metadata aplikasi uji, bukan app klien. */
import {createGasClient} from '../frontend-next/src/lib/server/gas-client.mjs';
import {createAuthentication} from '../frontend-next/src/lib/server/authentication.mjs';
import {createApplicationRegistry} from '../frontend-next/src/lib/server/application-registry.mjs';
import {createUserDirectory} from '../frontend-next/src/lib/server/user-directory.mjs';
import {sign} from '../frontend-next/src/lib/server/protocol.mjs';
let auth,registry,token,applicationId,known=[];
try{
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw new Error();}
  const input=JSON.parse(raw);if(input.confirm_development!==true)throw Object.assign(new Error(),{code:'DEVELOPMENT_CONFIRMATION_REQUIRED'});
  const call=createGasClient({url:process.env.SSO_GAS_URL,keyId:process.env.SSO_GATEWAY_KEY_ID,key:process.env.SSO_GATEWAY_SECRET});
  auth=createAuthentication(call);registry=createApplicationRegistry(call);const directory=createUserDirectory(call);
  const session=await auth.loginAdministrator(input.username,input.password);token=session.sessionToken;
  const results=[],created=await registry.createApplication(token,{application_name:'Uji Lifecycle Tahap 5 '+new Date().toISOString(),application_url:'https://uji.example.sch.id'});
  applicationId=created.application.application_id;results.push({test:'Registrasi aplikasi nonaktif',status:'PASS',operation_id:created.operation_id});
  await registry.updateApplication(token,applicationId,created.application.record_version,{application_status:'active',api_access_enabled:true});
  const first=await registry.generateClientCredential(token,applicationId,{credential_name:'Uji awal',allowed_scopes:['user:status'],expires_in_seconds:300});known.push(first.credential.credential_id);
  results.push({test:'Penerbitan credential',status:'PASS',operation_id:first.operation_id});
  const request=key=>sign({aud:'central-sso-app',op:'user.status',application_id:applicationId,key_id:key.credential.key_id,payload:{user_id:session.user.sso_user_id}},key.client_secret);
  await directory.getUserStatus(request(first));
  const next=await registry.rotateClientCredential(token,first.credential.credential_id,first.credential.revision,{expires_in_seconds:300});known.push(next.credential.credential_id);
  results.push({test:'Rotasi',status:'PASS',operation_id:next.operation_id});
  async function denied(name,key){try{await directory.getUserStatus(request(key));results.push({test:name,status:'FAIL'});}catch(e){results.push({test:name,status:e.code==='INVALID_CLIENT'?'PASS':'FAIL',actual:e.code||'SERVICE_UNAVAILABLE'});}}
  await denied('Key lama ditolak',first);await directory.getUserStatus(request(next));
  await registry.revokeClientCredential(token,next.credential.credential_id,next.credential.revision);await denied('Key dicabut ditolak',next);
  const latest=(await registry.getApplication(token,applicationId)).application;await registry.disableApplication(token,applicationId,latest.record_version);
  results.push({test:'Aplikasi dinonaktifkan',status:'PASS'});
  console.log(JSON.stringify({application_id:applicationId,results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}catch(e){
  const output={error:/^[A-Z_]+$/.test(e?.code||'')?e.code:'SERVICE_UNAVAILABLE'};
  if(typeof e?.operation_id==='string'&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(e.operation_id))output.operation_id=e.operation_id;
  console.error(JSON.stringify(output));process.exitCode=1;
}finally{
  if(token&&registry){
    for(const id of known){try{const c=(await registry.getCredential(token,id)).credential;if(c.status!=='revoked')await registry.revokeClientCredential(token,id,c.revision);}catch{console.error('Sebagian cleanup credential perlu diperiksa manual.');process.exitCode=1;}}
    if(applicationId){try{const a=(await registry.getApplication(token,applicationId)).application;if(a.application_status!=='inactive')await registry.disableApplication(token,applicationId,a.record_version);}catch{console.error('Periksa status aplikasi uji secara manual.');process.exitCode=1;}}
    try{await auth.logout(token);}catch{console.error('Periksa pencabutan sesi uji secara manual.');process.exitCode=1;}
  }
}

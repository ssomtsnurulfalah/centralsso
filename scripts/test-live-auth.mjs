/** Test script saja, bukan aplikasi klien/SDK. Input rahasia melalui stdin. */
import { sign } from '../frontend-next/src/lib/server/protocol.mjs';
import { createGasClient } from '../frontend-next/src/lib/server/gas-client.mjs';
import { createAuthentication } from '../frontend-next/src/lib/server/authentication.mjs';
try {
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>16384)throw new Error('INPUT_TOO_LARGE');}
  const input=JSON.parse(raw);
  const auth=createAuthentication(createGasClient({url:process.env.SSO_GAS_URL,keyId:process.env.SSO_GATEWAY_KEY_ID,key:process.env.SSO_GATEWAY_SECRET}));
  const make=(password=input.password,extra={})=>sign({aud:'central-sso-app',op:'authenticate.user',application_id:input.application_id,key_id:input.key_id,payload:{username:input.username,password},...extra},input.client_secret);
  const results=[];
  const request=make();
  const identity=await auth.authenticateUser(request);results.push({test:'Login benar',status:'PASS',sso_user_id:identity.sso_user_id});
  async function denied(name,envelope,expected){try{await auth.authenticateUser(envelope);results.push({test:name,status:'FAIL',actual:'Diterima'});}catch(e){results.push({test:name,status:e.code===expected?'PASS':'FAIL',actual:e.code||'SERVICE_UNAVAILABLE'});}}
  await denied('Replay ditolak',request,'REPLAY_DETECTED');
  await denied('Password salah',make(input.password+'__wrong'),'INVALID_CREDENTIALS');
  await denied('Timestamp lama',make(input.password,{timestamp:String(Date.now()-180000)}),'REQUEST_EXPIRED');
  console.log(JSON.stringify({results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}catch(e){console.error('Pengujian live gagal: '+(/^[A-Z_]+$/.test(e?.code||'')?e.code:'SERVICE_UNAVAILABLE'));process.exitCode=1;}

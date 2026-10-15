/** Script uji development, bukan aplikasi klien atau SDK. Jangan log payload/secret. */
import {sign} from '../frontend-next/src/lib/server/protocol.mjs';
import {createGasClient} from '../frontend-next/src/lib/server/gas-client.mjs';
import {createUserDirectory} from '../frontend-next/src/lib/server/user-directory.mjs';
try{
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw new Error();}
  const input=JSON.parse(raw);
  const directory=createUserDirectory(createGasClient({url:process.env.SSO_GAS_URL,keyId:process.env.SSO_GATEWAY_KEY_ID,key:process.env.SSO_GATEWAY_SECRET}));
  const make=(op,payload)=>sign({aud:'central-sso-app',op,application_id:input.application_id,key_id:input.key_id,payload},input.client_secret);
  const results=[],search=make('directory.search',{query:'',page:1,page_size:1});
  const found=await directory.searchUsers(search);
  results.push({test:'Pencarian terbatas',status:'PASS',returned:found.items.length,request_id:found.request_id});
  const userId=input.user_id||found.items[0]?.sso_user_id;
  if(!userId)throw Object.assign(new Error(),{code:'NOT_FOUND'});
  const user=await directory.getUserById(make('directory.get',{user_id:userId}));
  results.push({test:'Detail User ID',status:user.user.sso_user_id===userId?'PASS':'FAIL',request_id:user.request_id});
  const state=await directory.getUserStatus(make('user.status',{user_id:userId}));
  results.push({test:'Status User ID',status:state.sso_user_id===userId?'PASS':'FAIL',account_status:state.account_status,request_id:state.request_id});
  try{await directory.searchUsers(search);results.push({test:'Replay ditolak',status:'FAIL'});}catch(e){results.push({test:'Replay ditolak',status:e.code==='REPLAY_DETECTED'?'PASS':'FAIL',actual:e.code||'SERVICE_UNAVAILABLE'});}
  console.log(JSON.stringify({results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}catch(e){console.error('Uji direktori gagal: '+(/^[A-Z_]+$/.test(e?.code||'')?e.code:'SERVICE_UNAVAILABLE'));process.exitCode=1;}

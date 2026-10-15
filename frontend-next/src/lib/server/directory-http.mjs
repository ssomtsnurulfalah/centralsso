import {randomUUID} from 'node:crypto';
import {createGasClient,readLimited} from './gas-client.mjs';
import {createUserDirectory} from './user-directory.mjs';
const methods=['searchUsers','getUserById','getUserStatus'];
const codes={INVALID_CLIENT:401,INVALID_SIGNATURE:401,REQUEST_EXPIRED:401,REPLAY_DETECTED:409,RATE_LIMITED:429,PERMISSION_DENIED:403,APPLICATION_INACTIVE:403,VALIDATION_ERROR:400,PAYLOAD_TOO_LARGE:413,NOT_FOUND:404};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export function createDirectoryHandler(method,{call}={}){
  if(!methods.includes(method))throw new Error('Operasi direktori tidak diizinkan.');
  return async function POST(request){
    let id=randomUUID();
    try{
      if(request.method!=='POST')return Response.json({success:false,error:{code:'PERMISSION_DENIED',message:'Metode tidak diizinkan.'},request_id:id,timestamp:new Date().toISOString()},{status:405,headers:{...headers,Allow:'POST'}});
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Object.assign(new Error(),{code:'VALIDATION_ERROR'});
      if(!request.body)throw Object.assign(new Error(),{code:'VALIDATION_ERROR'});
      const envelope=JSON.parse(await readLimited(request,12288,'PAYLOAD_TOO_LARGE'));
      const invoke=call||createGasClient({url:process.env.SSO_GAS_URL,keyId:process.env.SSO_GATEWAY_KEY_ID,key:process.env.SSO_GATEWAY_SECRET});
      const data=await createUserDirectory(invoke)[method](envelope);id=data.request_id;
      return Response.json({success:true,data,request_id:id,timestamp:new Date().toISOString()},{headers});
    }catch(e){
      const code=codes[e?.code]?e.code:e instanceof SyntaxError?'VALIDATION_ERROR':'SERVICE_UNAVAILABLE';
      return Response.json({success:false,error:{code,message:code==='NOT_FOUND'?'Pengguna tidak ditemukan.':code==='RATE_LIMITED'?'Batas permintaan tercapai. Coba kembali nanti.':'Permintaan direktori tidak dapat diproses.'},request_id:id,timestamp:new Date().toISOString()},{status:codes[code]||503,headers});
    }
  };
}

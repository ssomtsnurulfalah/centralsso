import { randomUUID } from 'node:crypto';
import { createGasClient, readLimited } from './gas-client.mjs';
import { createAuthentication } from './authentication.mjs';
const status = { INVALID_CREDENTIALS:401, INVALID_CLIENT:401, INVALID_SIGNATURE:401, REQUEST_EXPIRED:401, REPLAY_DETECTED:409, RATE_LIMITED:429, PERMISSION_DENIED:403, APPLICATION_INACTIVE:403, VALIDATION_ERROR:400, INVALID_CHALLENGE:401, PAYLOAD_TOO_LARGE:413 };
export function createVerifyHandler({call} = {}) {
  return async function POST(request) {
    let id=randomUUID();
    try {
      if(request.method!=='POST')return Response.json({success:false,error:{code:'PERMISSION_DENIED',message:'Metode tidak diizinkan.'},request_id:id,timestamp:new Date().toISOString()},{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Object.assign(new Error(),{code:'VALIDATION_ERROR'});
      const body=JSON.parse(await readLimited(request,12288,'PAYLOAD_TOO_LARGE'));
      const invoke=call||createGasClient({url:process.env.SSO_GAS_URL,keyId:process.env.SSO_GATEWAY_KEY_ID,key:process.env.SSO_GATEWAY_SECRET});
      const data=await createAuthentication(invoke).authenticateUser(body);
      id=data.request_id;
      return Response.json({success:true,data,request_id:id,timestamp:new Date().toISOString()},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    } catch(e) {
      const code=status[e?.code]?e.code:e instanceof SyntaxError?'VALIDATION_ERROR':'SERVICE_UNAVAILABLE';
      return Response.json({success:false,error:{code,message:code==='INVALID_CREDENTIALS'?'Username atau password tidak valid, atau akun tidak dapat digunakan.':code==='RATE_LIMITED'?'Terlalu banyak percobaan. Coba kembali nanti.':'Permintaan tidak dapat diproses.'},request_id:id,timestamp:new Date().toISOString()},{status:status[code]||503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
  };
}
export const POST=createVerifyHandler();

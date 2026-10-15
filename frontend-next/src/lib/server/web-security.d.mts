export function cookieName(production:boolean):'__Host-central_sso_session'|'central_sso_dev_session';
export function cookieOptions(production:boolean,expiresAt?:string):{httpOnly:true,secure:boolean,sameSite:'lax',path:'/',expires?:Date};
export function checkOrigin(request:Request,expected:string|undefined,production:boolean):void;
export const messages:Record<string,string>;
export function safeError(error:unknown):{code:string,message:string,status:number,operation_id?:string};

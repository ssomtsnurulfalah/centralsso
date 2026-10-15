/** Protokol request v1: HMAC atas JSON array string, payload berupa base64url. */
var SsoRequestSecurity = (function () {
  var keys=['v','aud','op','application_id','key_id','request_id','timestamp','nonce','payload'];
  function sha(value) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
  }
  function hmac(value,secret) {
    return Utilities.computeHmacSha256Signature(value,secret,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
  }
  function frame(envelope,audience) {
    var U=SsoDbUtils;
    if(!envelope || typeof envelope!=='object' || Array.isArray(envelope) || Object.keys(envelope).sort().join(',')!==keys.concat(['signature']).sort().join(',')) U.fail('VALIDATION_ERROR','Envelope tidak valid.');
    keys.forEach(function(k){if(typeof envelope[k]!=='string')U.fail('VALIDATION_ERROR','Tipe envelope tidak valid.');});
    if(envelope.v!=='1' || envelope.aud!==audience || !/^[a-z.]{3,40}$/.test(envelope.op) ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(envelope.key_id) || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(envelope.request_id) ||
      !/^\d{13}$/.test(envelope.timestamp) || !/^[0-9a-f]{64}$/.test(envelope.nonce) ||
      !/^[A-Za-z0-9_-]{1,24000}$/.test(envelope.payload) || !/^[0-9a-f]{64}$/.test(envelope.signature)) U.fail('VALIDATION_ERROR','Format envelope tidak valid.');
    return JSON.stringify(keys.map(function(k){return envelope[k];}));
  }
  // Loop kerja tetap setelah format diperiksa; GAS tidak memberi jaminan native timing-safe.
  function equal(a,b) {if(a.length!==b.length)return false;var n=0;for(var i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
  function verify(envelope,audience,secret,skew) {
    var canonical=frame(envelope,audience);
    if(!/^[0-9a-f]{64}$/.test(secret||''))SsoDbUtils.fail('CONFIGURATION_ERROR','Kunci server belum dikonfigurasi.');
    if(!equal(hmac(canonical,secret),envelope.signature))SsoDbUtils.fail('INVALID_SIGNATURE','Signature tidak valid.');
    if(Math.abs(Date.now()-Number(envelope.timestamp))>skew*1000)SsoDbUtils.fail('REQUEST_EXPIRED','Request kedaluwarsa.');
    return canonical;
  }
  function payload(envelope) {
    try {
      var bytes=Utilities.base64DecodeWebSafe(envelope.payload);
      if(Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'')!==envelope.payload)throw new Error('encoding');
      var value=JSON.parse(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
      if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('object');
      return value;
    } catch(e){SsoDbUtils.fail('VALIDATION_ERROR','Payload tidak valid.');}
  }
  function exact(value,fields) {
    if(!value || typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==fields.slice().sort().join(','))SsoDbUtils.fail('VALIDATION_ERROR','Field payload tidak valid.');
  }
  function rememberNonce(tx,envelope,principal,ttl) {
    var digest=sha(envelope.nonce), list=tx.list('ReplayNonces',{filters:{principal_key:principal,nonce_hash:digest},pageSize:1});
    if(list.total)SsoDbUtils.fail('REPLAY_DETECTED','Request sudah digunakan.');
    tx.insert('ReplayNonces',{principal_key:principal,nonce_hash:digest,request_id:envelope.request_id,expires_at:new Date(Date.now()+ttl*1000).toISOString()});
  }
  return {sha:sha,hmac:hmac,frame:frame,verify:verify,payload:payload,exact:exact,rememberNonce:rememberNonce,equal:equal};
})();

import { sign } from './protocol.mjs';
if (typeof window !== 'undefined') throw new Error('Modul ini hanya untuk server.');
function unavailable() { return Object.assign(new Error('Layanan autentikasi tidak tersedia.'), { code: 'SERVICE_UNAVAILABLE' }); }
export async function readLimited(response, max = 65536, limitCode = 'SERVICE_UNAVAILABLE') {
  if (!response.body) throw unavailable();
  const reader = response.body.getReader();
  let size = 0; const parts = [];
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw Object.assign(new Error('Ukuran pesan melebihi batas.'), {code: limitCode}); } parts.push(Buffer.from(value)); }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts).toString('utf8');
}
export function createGasClient({url, keyId, key, fetchImpl = fetch}) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url || '') || !/^[a-zA-Z0-9_-]{1,64}$/.test(keyId || '') || !/^[0-9a-f]{64}$/.test(key || '')) throw unavailable();
  return async function call(op, payload) {
    const envelope = sign({ aud: 'central-sso-internal', op, key_id: keyId, payload }, key);
    try {
      const signal = AbortSignal.timeout(15000);
      let response = await fetchImpl(url, { method: 'POST', redirect: 'manual', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope) });
      if ([302, 303].includes(response.status)) {
        const location = new URL(response.headers.get('location') || '');
        if (location.protocol !== 'https:' || location.hostname !== 'script.googleusercontent.com' || location.username || location.password || (location.port && location.port !== '443')) throw unavailable();
        // Redirect ContentService dituju dengan GET; jangan kirim ulang body/kunci/password.
        await response.body?.cancel();
        response = await fetchImpl(location.href, { method: 'GET', redirect: 'error', cache: 'no-store', signal });
      }
      if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw unavailable();
      const value = JSON.parse(await readLimited(response));
      if (!value || typeof value.success !== 'boolean' || value.request_id !== envelope.request_id || typeof value.timestamp !== 'string' || !Number.isFinite(Date.parse(value.timestamp))) throw unavailable();
      if (!value.success) {
        const allowed = new Set(['INVALID_CREDENTIALS','INVALID_CLIENT','INVALID_SIGNATURE','REQUEST_EXPIRED','REPLAY_DETECTED','RATE_LIMITED','PERMISSION_DENIED','APPLICATION_INACTIVE','VALIDATION_ERROR','INVALID_CHALLENGE','UNAUTHENTICATED','NOT_FOUND','VERSION_CONFLICT','OPERATION_ALREADY_PROCESSED','CREDENTIAL_LIMIT','INVALID_STATE','LAST_SUPER_ADMIN']);
        throw Object.assign(new Error('Permintaan autentikasi ditolak.'), { code: allowed.has(value.error?.code) ? value.error.code : 'SERVICE_UNAVAILABLE' });
      }
      if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) throw unavailable();
      return value.data;
    } catch (error) { if (typeof error?.code === 'string' && error.code !== 'ABORT_ERR') throw error; throw unavailable(); }
  };
}

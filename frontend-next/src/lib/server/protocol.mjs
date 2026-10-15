import { createHmac, randomUUID } from 'node:crypto';
import { secret } from './password.mjs';
const FIELDS = ['v', 'aud', 'op', 'application_id', 'key_id', 'request_id', 'timestamp', 'nonce', 'payload'];
export function frame(envelope, audience) {
  if (!envelope || Array.isArray(envelope) || Object.keys(envelope).sort().join(',') !== [...FIELDS, 'signature'].sort().join(',') || FIELDS.some(k => typeof envelope[k] !== 'string') || envelope.v !== '1' || envelope.aud !== audience || !/^[a-z.]{3,40}$/.test(envelope.op) || !/^[a-zA-Z0-9_-]{1,64}$/.test(envelope.key_id) || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(envelope.request_id) || !/^\d{13}$/.test(envelope.timestamp) || !/^[0-9a-f]{64}$/.test(envelope.nonce) || !/^[A-Za-z0-9_-]{1,24000}$/.test(envelope.payload) || !/^[0-9a-f]{64}$/.test(envelope.signature)) throw Object.assign(new Error('Envelope tidak valid.'), { code: 'VALIDATION_ERROR' });
  return JSON.stringify(FIELDS.map(k => envelope[k]));
}
export function sign({aud, op, application_id = '', key_id, payload, request_id = randomUUID(), timestamp = String(Date.now()), nonce = secret()}, key) {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Kunci harus 32 byte hex.');
  const value = { v: '1', aud, op, application_id, key_id, request_id, timestamp, nonce, payload: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'), signature: '0'.repeat(64) };
  value.signature = createHmac('sha256', key).update(frame(value, aud), 'utf8').digest('hex');
  return value;
}
export function decode(envelope) {
  try {
    const bytes = Buffer.from(envelope.payload, 'base64url');
    if (bytes.toString('base64url') !== envelope.payload) throw new Error();
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw Object.assign(new Error('Payload tidak valid.'), { code: 'VALIDATION_ERROR' }); }
}

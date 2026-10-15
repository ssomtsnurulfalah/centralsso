import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
if (typeof window !== 'undefined') throw new Error('Modul ini hanya boleh digunakan di server.');
const derive = promisify(scrypt);
export const PARAMETERS = Object.freeze({ N: 131072, r: 8, p: 1, keylen: 64 });
const OPTIONS = { N: PARAMETERS.N, r: PARAMETERS.r, p: PARAMETERS.p, maxmem: 256 * 1024 * 1024 };
let active = 0;
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
async function kdf(password, salt) {
  // Batas per instance; pembatas global persisten dilakukan GAS sebelum tahap ini.
  if (active >= 2) fail('SERVICE_UNAVAILABLE', 'Layanan sedang sibuk.');
  active++;
  try { return await derive(password, salt, PARAMETERS.keylen, OPTIONS); }
  finally { active--; }
}
export function validatePassword(password, policy = { min_length: 15, max_length: 128 }) {
  if (!policy || !Number.isSafeInteger(policy.min_length) || !Number.isSafeInteger(policy.max_length) || policy.min_length < 15 || policy.max_length > 1024 || policy.max_length < policy.min_length) fail('SERVICE_UNAVAILABLE', 'Kebijakan password tidak valid.');
  if (typeof password !== 'string' || Array.from(password).length < policy.min_length || Array.from(password).length > policy.max_length || Buffer.byteLength(password, 'utf8') > 4096) fail('VALIDATION_ERROR', `Password harus ${policy.min_length}–${policy.max_length} karakter.`);
}
export function secret() { return randomBytes(32).toString('hex'); }
export function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
export async function hashPassword(password, policy) {
  validatePassword(password, policy);
  const salt = randomBytes(16);
  const key = await kdf(password, salt);
  try { return { password_algorithm: 'scrypt', password_hash: key.toString('hex'), password_salt: salt.toString('hex'), password_parameters: JSON.stringify(PARAMETERS) }; }
  finally { key.fill(0); }
}
function validateMaterial(material) {
  let params;
  try { params = JSON.parse(material.password_parameters); } catch { fail('SERVICE_UNAVAILABLE', 'Metadata password tidak valid.'); }
  if (!material || material.password_algorithm !== 'scrypt' || !/^[0-9a-f]{128}$/.test(material.password_hash) || !/^[0-9a-f]{32}$/.test(material.password_salt) || !params || Object.keys(params).sort().join(',') !== 'N,keylen,p,r' || Object.entries(PARAMETERS).some(([key, value]) => params[key] !== value)) fail('SERVICE_UNAVAILABLE', 'Metadata password tidak valid.');
}
export async function verifyPassword(password, material) {
  if (typeof password !== 'string' || !password.length || Array.from(password).length > 1024 || Buffer.byteLength(password, 'utf8') > 4096) fail('VALIDATION_ERROR', 'Format password tidak valid.');
  const real = material !== null;
  const value = material || { password_algorithm: 'scrypt', password_hash: '0'.repeat(128), password_salt: '0'.repeat(32), password_parameters: JSON.stringify(PARAMETERS) };
  validateMaterial(value);
  const key = await kdf(password, Buffer.from(value.password_salt, 'hex'));
  try { return timingSafeEqual(key, Buffer.from(value.password_hash, 'hex')) && real; }
  finally { key.fill(0); }
}

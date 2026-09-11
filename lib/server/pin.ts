import { ApiError } from './http';
import { supabase } from './supabase';
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
export async function keyedToken(value: string, envName: string) {
  const secret = process.env[envName];
  if (!secret || secret.length < 64)
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  );
}
export async function pinPassword(email: string, pin: string) {
  // A leaked publishable key cannot be used to guess six-digit PINs directly
  // against GoTrue. The online gateway enforces per-account limits first.
  return keyedToken(
    `mosque-pin-v1:${email.trim().toLowerCase()}:${pin}`,
    'PIN_PEPPER',
  );
}
export async function loginIdentity(identifier: string) {
  const gate = process.env.LOGIN_GATE_SECRET;
  if (!gate || gate.length < 64) throw new ApiError(503, 'AUTH_NOT_CONFIGURED');
  const result = await supabase().rpc('mosque_login_identity', {
    identifier: identifier.trim(),
    gate,
  });
  if (result.error) throw new ApiError(503, 'AUTH_NOT_CONFIGURED');
  if (!result.data) throw new ApiError(401, 'INVALID_CREDENTIALS');
  return result.data as string;
}

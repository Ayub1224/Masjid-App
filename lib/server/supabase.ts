import { createClient, type Session } from '@supabase/supabase-js';
import { ApiError, cookie } from './http';
export function config() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY,
    origin = process.env.APP_ORIGIN;
  if (!url || !key || !origin)
    throw new ApiError(503, 'BACKEND_NOT_CONFIGURED');
  // Require the current publishable key format; a secret/service-role key must never enable this client.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new ApiError(503,'PUBLISHABLE_KEY_REQUIRED');
  if (
    !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) ||
    new URL(origin).origin !== origin ||
    !origin.startsWith('https://')
  )
    throw new ApiError(503, 'BACKEND_CONFIGURATION_INVALID');
  return { url, key, origin };
}
export function supabase(token?: string) {
  const { url, key } = config();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  });
}
export async function authenticated(request: Request) {
  const header = request.headers.get('authorization');
  const token = header
    ? /^Bearer [A-Za-z0-9._-]+$/.test(header)
      ? header.slice(7)
      : undefined
    : cookie(request, '__Host-mosque-access');
  if (!token || token.length > 8192)
    throw new ApiError(401, 'SIGN_IN_REQUIRED');
  const client = supabase(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at)
    throw new ApiError(401, 'SIGN_IN_REQUIRED');
  return { client, user: data.user, token };
}
export function sessionCookies(
  response: Response,
  session: Session,
  remember: boolean,
) {
  const suffix = '; Path=/; Secure; HttpOnly; SameSite=Lax';
  response.headers.append(
    'Set-Cookie',
    `__Host-mosque-access=${session.access_token}${suffix}; Max-Age=${Math.min(session.expires_in, 3600)}`,
  );
  response.headers.append(
    'Set-Cookie',
    `__Host-mosque-refresh=${session.refresh_token}${suffix}${remember ? '; Max-Age=1209600' : ''}`,
  );
  response.headers.append(
    'Set-Cookie',
    `__Host-mosque-remember=${remember ? '1' : '0'}${suffix}${remember ? '; Max-Age=1209600' : ''}`,
  );
  return response;
}
export function clearCookies(response: Response) {
  for (const key of ['access', 'refresh', 'remember'])
    response.headers.append(
      'Set-Cookie',
      `__Host-mosque-${key}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
  return response;
}
export async function captcha(token: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new ApiError(503, 'AUTH_NOT_CONFIGURED');
  const { origin } = config();
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const data = (await response.json()) as {
    success?: boolean;
    hostname?: string;
  };
  if (
    !response.ok ||
    data.success !== true ||
    data.hostname !== new URL(origin).hostname
  )
    throw new ApiError(400, 'CAPTCHA_REJECTED');
}

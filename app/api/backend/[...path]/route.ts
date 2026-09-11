import { mosqueDetailsSchema } from '@/lib/mosque-details';
import { z } from 'zod';
import { keyedToken, pinPassword, loginIdentity } from '@/lib/server/pin';
import {
  ApiError,
  json,
  bodyJson,
  boundedBody,
  sameOrigin,
  imageType,
  cookie,
} from '@/lib/server/http';
import {
  authenticated,
  config,
  supabase,
  sessionCookies,
  clearCookies,
  captcha,
} from '@/lib/server/supabase';
import {
  commandSchema,
  credentials,
  registration,
  fileRequest,
} from '@/lib/server/validation';
export const dynamic = 'force-dynamic';
const uuid = z.uuid();
function dbError(error: { code?: string } | null) {
  if (!error) return;
  const status =
    error.code === '42501'
      ? 403
      : error.code === '23505'
        ? 409
        : error.code === '22023' ||
            error.code === '23514' ||
            error.code === '23502' ||
            error.code === '22P02'
          ? 400
          : error.code === 'P0001'
            ? 429
            : 503;
  throw new ApiError(
    status,
    status === 403
      ? 'PERMISSION_OR_MFA_REQUIRED'
      : status === 409
        ? 'CONFLICT'
        : status === 400
          ? 'INVALID_COMMAND'
          : status === 429
            ? 'RATE_LIMITED'
            : 'SERVICE_UNAVAILABLE',
  );
}
async function handle(request: Request) {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/backend\//, '');
    if (path === 'settings' && request.method === 'GET')
      return json({
        turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? '',
      });
    const { origin } = config();
    if (request.method !== 'GET') {
      // Bearer clients (future mobile app) do not rely on ambient cookies. Browser cookies always require an exact trusted Origin.
      if (
        !request.headers.get('authorization') ||
        request.headers.has('cookie') ||
        path.startsWith('auth/')
      )
        sameOrigin(request, origin);
    }
    if (path === 'mosque' && request.method === 'GET') {
      const { data, error } = await supabase()
        .from('mosque_details')
        .select('name,address,latitude,longitude,picture')
        .maybeSingle();
      dbError(error);
      return json(data);
    }
    if (path === 'public' && request.method === 'GET') {
      const client = supabase();
      const [prayers, news] = await Promise.all([
        client.from('mosque_prayers').select('name,adhan,jamaat,updated_at'),
        client
          .from('mosque_news')
          .select('id,title,body,hindi_title,hindi_body,event_on,image_url')
          .eq('published', true)
          .order('event_on', { ascending: false })
          .limit(20),
      ]);
      dbError(prayers.error);
      dbError(news.error);
      return json({ prayers: prayers.data, news: news.data });
    }
    if (path === 'auth/login' && request.method === 'POST') {
      const input = credentials.parse(await bodyJson(request));
      await captcha(input.captchaToken);
      const email = await loginIdentity(input.identifier);
      const { data, error } = await supabase().auth.signInWithPassword({
        email,
        password: await pinPassword(email, input.pin),
      });
      if (error || !data.session)
        throw new ApiError(401, 'INVALID_CREDENTIALS');
      return sessionCookies(json({ ok: true }), data.session, input.remember);
    }
    if (path === 'auth/identify' && request.method === 'POST') {
      const input = z
        .strictObject({ identifier: z.string().trim().min(3).max(254) })
        .parse(await bodyJson(request));
      try {
        await loginIdentity(input.identifier);
      } catch {
        throw new ApiError(404, 'ACCOUNT_NOT_FOUND');
      }
      return json({ kind: 'pin', digits: 6 });
    }
    if (path === 'auth/register' && request.method === 'POST') {
      const input = registration.parse(await bodyJson(request));
      await captcha(input.captchaToken);
      const client = supabase();
      const check = await client.rpc('mosque_invitation_valid', {
        token: input.invitationToken,
        email: input.identifier,
      });
      dbError(check.error);
      if (check.data !== true)
        throw new ApiError(400, 'INVITATION_UNAVAILABLE');
      const { error } = await client.auth.signUp({
        email: input.identifier,
        password: await pinPassword(input.identifier, input.pin),
        options: { emailRedirectTo: `${origin}/invite` },
      });
      if (error) throw new ApiError(400, 'REGISTRATION_UNAVAILABLE');
      return json(
        {
          message:
            'Check your email to confirm your account. Then sign in and accept your invitation.',
        },
        202,
      );
    }
    if (path === 'auth/refresh' && request.method === 'POST') {
      const token = cookie(request, '__Host-mosque-refresh');
      if (!token) throw new ApiError(401, 'SIGN_IN_REQUIRED');
      const { data, error } = await supabase().auth.refreshSession({
        refresh_token: token,
      });
      if (error || !data.session)
        return clearCookies(json({ error: 'SIGN_IN_REQUIRED' }, 401));
      return sessionCookies(
        json({ ok: true }),
        data.session,
        cookie(request, '__Host-mosque-remember') === '1',
      );
    }
    if (path === 'auth/recover' && request.method === 'POST') {
      const input = z
        .strictObject({
          email: z.email().max(254),
          captchaToken: z.string().min(1).max(2048),
        })
        .parse(await bodyJson(request));
      await captcha(input.captchaToken);
      // Never reveal whether an email address is registered.
      await supabase().auth.resetPasswordForEmail(input.email, {
        redirectTo: `${origin}/forgot-password`,
      });
      return json(
        {
          message: 'If the account is eligible, a recovery email will arrive.',
        },
        202,
      );
    }
    if (path === 'auth/confirm' && request.method === 'POST') {
      const input = z
        .strictObject({
          tokenHash: z.string().min(32).max(256),
          type: z.enum(['signup', 'recovery']),
        })
        .parse(await bodyJson(request));
      const { data, error } = await supabase().auth.verifyOtp({
        token_hash: input.tokenHash,
        type: input.type,
      });
      if (error || !data.session)
        throw new ApiError(400, 'LINK_EXPIRED_OR_INVALID');
      return sessionCookies(json({ ok: true }), data.session, false);
    }
    const { client, user, token } = await authenticated(request);
    if (path === 'mosque' && request.method === 'POST') {
      const input = mosqueDetailsSchema.parse(await bodyJson(request, 720000));
      const { error } = await client.rpc('mosque_save_details', { input });
      dbError(error);
      return json({ ok: true });
    }
    if (path === 'auth/logout' && request.method === 'POST') {
      // Revoke refresh tokens using the caller JWT; no service-role key is used.
      const response = await fetch(
        `${config().url}/auth/v1/logout?scope=global`,
        {
          method: 'POST',
          headers: { apikey: config().key, Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new ApiError(503, 'SIGN_OUT_UNAVAILABLE');
      return clearCookies(json({ ok: true }));
    }
    if (path === 'auth/password' && request.method === 'POST') {
      const input = z
        .strictObject({
          pin: z.string().regex(/^\d{6}$/),
          nonce: z.string().max(32).optional(),
        })
        .parse(await bodyJson(request));
      const response = await fetch(`${config().url}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: config().key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: await pinPassword(user.email!, input.pin),
          nonce: input.nonce,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new ApiError(400, 'PASSWORD_UPDATE_REQUIRES_REAUTHENTICATION');
      return json({ ok: true });
    }
    if (path === 'auth/mfa' && request.method === 'GET') {
      const result = await client.auth.mfa.listFactors();
      if (result.error) throw new ApiError(400, 'MFA_UNAVAILABLE');
      return json(result.data);
    }
    if (path === 'auth/mfa/enroll' && request.method === 'POST') {
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Mosque administrator',
      });
      if (error) throw new ApiError(400, 'MFA_ENROLLMENT_UNAVAILABLE');
      return json(data);
    }
    if (path === 'auth/mfa/verify' && request.method === 'POST') {
      const input = z
        .strictObject({ factorId: uuid, code: z.string().regex(/^\d{6}$/) })
        .parse(await bodyJson(request));
      const { data, error } = await client.auth.mfa.challengeAndVerify(input);
      if (error || !data) throw new ApiError(400, 'MFA_CODE_REJECTED');
      // Supabase returns an upgraded session after a successful TOTP challenge.
      return sessionCookies(
        json({ ok: true }),
        { ...data, token_type: 'bearer', user },
        cookie(request, '__Host-mosque-remember') === '1',
      );
    }
    if (path === 'me' && request.method === 'GET') {
      const profile = await client
        .from('mosque_profiles')
        .select('id,name,email,phone,address,role,permissions,active')
        .eq('id', user.id)
        .maybeSingle();
      dbError(profile.error);
      const claims = await client.auth.getClaims(token);
      return json({
        profile: profile.data,
        userId: user.id,
        aal: claims.data?.claims.aal ?? 'aal1',
      });
    }
    if (path === 'payment-names' && request.method === 'GET') {
      const result = await client.rpc('mosque_payment_names');
      dbError(result.error);
      return json({ names: result.data });
    }
    if (path === 'records' && request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const table = z
        .enum([
          'mosque_profiles',
          'mosque_payments',
          'mosque_expenses',
          'mosque_balance_checks',
          'mosque_prayers',
          'mosque_news',
          'mosque_receiving',
        ])
        .parse(params.get('table'));
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(params.get('page') ?? 0);
      const columns = {
        mosque_profiles: 'id,name,email,phone,address,role,active,permissions',
        mosque_payments:
          'id,member_id,amount_paise,paid_on,purpose,method,reference,evidence_path,status,reason,created_at',
        mosque_expenses:
          'id,amount_paise,paid_on,category,description,account,status,reason,created_at',
        mosque_balance_checks:
          'id,observed_paise,recorded_paise,as_of,note,created_at',
        mosque_prayers: 'name,adhan,jamaat,updated_at',
        mosque_news:
          'id,title,body,hindi_title,hindi_body,event_on,published,image_url',
        mosque_receiving: 'upi,recipient,qr_path,updated_at',
      };
      const result = await client
        .from(table)
        .select(columns[table])
        .order(
          table === 'mosque_prayers'
            ? 'name'
            : table === 'mosque_receiving'
              ? 'updated_at'
              : 'id',
        )
        .range(page * 50, page * 50 + 49);
      dbError(result.error);
      return json({ records: result.data, page });
    }
    if (path === 'invitations' && request.method === 'GET') {
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(new URL(request.url).searchParams.get('page') ?? 0);
      const result = await client.rpc('mosque_invitation_list', { page });
      dbError(result.error);
      return json({ invitations: result.data, page });
    }
    if (path === 'finances' && request.method === 'GET') {
      const result = await client.rpc('mosque_financial_summary');
      dbError(result.error);
      return json(result.data);
    }
    if (path === 'activity' && request.method === 'GET') {
      const result = await client.rpc('mosque_activity');
      dbError(result.error);
      return json({ activity: result.data });
    }
    if (path === 'command' && request.method === 'POST') {
      const requestId = uuid.parse(request.headers.get('idempotency-key'));
      const input = commandSchema.parse(await bodyJson(request));
      const invitationToken =
        input.type === 'invite'
          ? await keyedToken(
              `invite:${user.id}:${requestId}`,
              'INVITATION_SECRET',
            )
          : undefined;
      const result = await client.rpc('mosque_command', {
        request_id: requestId,
        body: invitationToken ? { ...input, token: invitationToken } : input,
      });
      dbError(result.error);
      // Tokens are returned once and carried in the URL fragment, outside server access logs and Referer headers.
      return json(
        {
          ...result.data,
          ...(invitationToken
            ? { invitationUrl: `${origin}/invite#token=${invitationToken}` }
            : {}),
        },
        201,
      );
    }
    if (path === 'files/upload' && request.method === 'POST') {
      const bucket = z
        .enum(['payment-evidence', 'mosque-qr'])
        .parse(new URL(request.url).searchParams.get('bucket'));
      const bytes = await boundedBody(request, 5242880);
      const type = imageType(bytes);
      if (request.headers.get('content-type') !== type.mime)
        throw new ApiError(415, 'IMAGE_TYPE_MISMATCH');
      const path = `${user.id}/${crypto.randomUUID()}.${type.extension}`;
      const result = await client.storage
        .from(bucket)
        .upload(path, bytes, { contentType: type.mime, upsert: false });
      if (result.error) throw new ApiError(403, 'UPLOAD_REJECTED');
      return json({ path }, 201);
    }
    if (path === 'files/download' && request.method === 'POST') {
      const input = fileRequest.parse(await bodyJson(request));
      const result = await client.storage
        .from(input.bucket)
        .createSignedUrl(input.path, 60, { download: true });
      if (result.error) throw new ApiError(404, 'FILE_UNAVAILABLE');
      return json({ url: result.data.signedUrl, expiresIn: 60 });
    }
    throw new ApiError(404, 'NOT_FOUND');
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.code }, error.status);
    if (error instanceof z.ZodError)
      return json({ error: 'INVALID_INPUT' }, 400);
    // Do not log payloads, credentials, tokens, private profile data, or database error details.
    return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  }
}
export const GET = handle;
export const POST = handle;

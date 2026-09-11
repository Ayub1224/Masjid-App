import { mosqueDetailsSchema } from '../lib/mosque-details';
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as OTPAuth from 'otpauth';
import { z } from 'zod';
import { pool, asUser } from './db';
import {
  hash,
  signed,
  pinHash,
  pinMatches,
  limit,
  identity,
  sessionCookie,
  newSession,
  sendLink,
} from './security';
import {
  ApiError,
  json,
  bodyJson,
  sameOrigin,
  boundedBody,
  imageType,
} from '../lib/server/http';
import { commandSchema, fileRequest } from '../lib/server/validation';
import { loginInput, credential, method, findAccount } from './credentials';
const origin = process.env.APP_ORIGIN!;
if (origin !== 'http://localhost:3000')
  throw Error('Local server requires localhost origin');
const columns: Record<string, string> = {
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
function totp(secret: string, email: string) {
  return new OTPAuth.TOTP({
    issuer: 'Local Mosque',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
}
export async function handle(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url),
      path = url.pathname.replace('/api/backend/', '');
    const post = request.method === 'POST';
    if (request.method !== 'GET' && !post)
      throw new ApiError(405, 'METHOD_NOT_ALLOWED');
    if (post) sameOrigin(request, origin);
    if (path === 'settings' && !post)
      return json({ local: true, turnstileSiteKey: '' });
    if (path === 'mosque' && !post)
      return json(
        await asUser(
          null,
          async (db) =>
            (
              await db.query(
                'select name,address,latitude,longitude,picture from mosque_details',
              )
            ).rows[0] ?? null,
        ),
      );
    if (path === 'public' && !post)
      return json(
        await asUser(null, async (db) => ({
          prayers: (
            await db.query(
              'select name,adhan,jamaat,updated_at from mosque_prayers',
            )
          ).rows,
          news: (
            await db.query(
              'select id,title,body,hindi_title,hindi_body,event_on,image_url from mosque_news where published order by event_on desc limit 20',
            )
          ).rows,
        })),
      );
    if (path === 'auth/identify' && post) {
      const input = z
        .object({
          identifier: z.string().trim().min(3).max(254),
          invitationToken: z.string().optional(),
        })
        .parse(await bodyJson(request));
      await limit('identify-global', 100);
      await limit('identify:' + input.identifier.toLowerCase(), 20);
      let role: string | undefined;
      if (input.invitationToken) {
        const r = await pool.query(
          'select role from mosque_private.invitations where token_hash=$1 and email=$2 and revoked_at is null and accepted_at is null and expires_at>now()',
          [
            Buffer.from(hash(input.invitationToken), 'hex'),
            input.identifier.toLowerCase(),
          ],
        );
        role = r.rows[0]?.role;
      } else role = (await findAccount(input.identifier))?.role;
      if (!role) throw new ApiError(400, 'ACCOUNT_OR_INVITATION_UNAVAILABLE');
      return json(method(role));
    }
    if (path === 'auth/login' && post) {
      const input = loginInput.parse(await bodyJson(request));
      await limit('login-global', 100);
      const lookup = await pool.query(
        'select mosque_login_identity($1,$2) email',
        [
          (await findAccount(input.identifier))?.email ?? input.identifier,
          process.env.LOGIN_GATE_SECRET,
        ],
      );
      const email = lookup.rows[0].email;
      const result = await pool.query(
        'select u.*,coalesce(p.role,u.credential_role) role from auth.users u left join mosque_profiles p on p.id=u.id where u.email=$1',
        [email],
      );
      const user = result.rows[0];
      if (
        !(await pinMatches(
          user ? credential(input, user.role) : 'invalid',
          user?.pin_hash ?? null,
        )) ||
        !user?.email_confirmed_at
      )
        throw new ApiError(401, 'INVALID_CREDENTIALS');
      const s = await newSession(user.id, false, input.remember);
      return sessionCookie(json({ ok: true }), s.token, s.seconds);
    }
    if (path === 'auth/register' && post) {
      const input = loginInput
        .extend({
          identifier: z.email(),
          invitationToken: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(await bodyJson(request));
      await limit('registration', 30);
      const email = input.identifier.toLowerCase();
      const valid = await asUser(null, (db) =>
        db.query('select mosque_invitation_valid($1,$2) valid', [
          input.invitationToken,
          email,
        ]),
      );
      if (!valid.rows[0].valid)
        throw new ApiError(400, 'INVITATION_UNAVAILABLE');
      const invitation = (
        await pool.query(
          'select role from mosque_private.invitations where token_hash=$1',
          [Buffer.from(hash(input.invitationToken), 'hex')],
        )
      ).rows[0];
      const value = credential(input, invitation.role);
      const id = randomUUID();
      await pool.query(
        'insert into auth.users(id,email,pin_hash,credential_role) values($1,$2,$3,$4)',
        [id, email, await pinHash(value), invitation.role],
      );
      await sendLink(id, email, 'signup');
      return json(
        {
          message:
            'Open the local email inbox at localhost:8025 to confirm your account.',
        },
        202,
      );
    }
    if (path === 'auth/recover' && post) {
      const input = z
        .object({ email: z.email(), captchaToken: z.string() })
        .parse(await bodyJson(request));
      await limit('recover:' + input.email.toLowerCase(), 5);
      await limit('recover-global', 30);
      const user = (
        await pool.query('select id from auth.users where email=$1', [
          input.email.toLowerCase(),
        ])
      ).rows[0];
      if (user) await sendLink(user.id, input.email, 'recovery');
      return json(
        {
          message:
            'If the account exists, a link is in the local inbox at localhost:8025.',
        },
        202,
      );
    }
    if (path === 'auth/confirm' && post) {
      const input = z
        .object({
          tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
          type: z.enum(['signup', 'recovery']),
        })
        .parse(await bodyJson(request));
      await limit('confirm', 50);
      const result = await pool.query(
        'delete from auth.links where hash=$1 and type=$2 and expires_at>now() returning user_id',
        [hash(input.tokenHash), input.type],
      );
      if (!result.rowCount) throw new ApiError(400, 'LINK_EXPIRED_OR_INVALID');
      const id = result.rows[0].user_id;
      await pool.query(
        'update auth.users set email_confirmed_at=coalesce(email_confirmed_at,now()) where id=$1',
        [id],
      );
      const s = await newSession(id, input.type === 'recovery');
      const account = (
        await pool.query(
          'select email,credential_role from auth.users where id=$1',
          [id],
        )
      ).rows[0];
      return sessionCookie(
        json({
          ok: true,
          identifier: account.email,
          method: method(account.credential_role),
        }),
        s.token,
        s.seconds,
      );
    }
    const user = await identity(request);
    if (path === 'mosque' && post) {
      const input = mosqueDetailsSchema.parse(await bodyJson(request, 720000));
      await asUser(user, (db) =>
        db.query('select mosque_save_details($1)', [input]),
      );
      return json({ ok: true });
    }
    if (path === 'auth/refresh' && post) return json({ ok: true });
    if (path === 'auth/logout' && post) {
      await pool.query('delete from auth.sessions where user_id=$1', [
        user.user_id,
      ]);
      return sessionCookie(json({ ok: true }), '', 0);
    }
    if (path === 'auth/password' && post) {
      if (!user.recovery)
        throw new ApiError(403, 'PASSWORD_UPDATE_REQUIRES_REAUTHENTICATION');
      const input = z
        .object({ pin: z.string().optional(), password: z.string().optional() })
        .parse(await bodyJson(request));
      await pool.query('update auth.users set pin_hash=$1 where id=$2', [
        await pinHash(credential(input, (await findAccount(user.email)).role)),
        user.user_id,
      ]);
      await pool.query('delete from auth.sessions where user_id=$1', [
        user.user_id,
      ]);
      const s = await newSession(user.user_id);
      return sessionCookie(json({ ok: true }), s.token, s.seconds);
    }
    if (path === 'auth/mfa' && !post) {
      const rows = (
        await pool.query(
          "select id,case when verified then 'verified' else 'unverified' end status from auth.factors where user_id=$1",
          [user.user_id],
        )
      ).rows;
      return json({ totp: rows });
    }
    if (
      path.startsWith('auth/mfa') &&
      !['owner', 'super-admin'].includes((await findAccount(user.email))?.role)
    )
      throw new ApiError(403, 'MFA_NOT_REQUIRED');
    if (path === 'auth/mfa/enroll' && post) {
      await limit('enroll:' + user.user_id, 5);
      const factor = totp(new OTPAuth.Secret({ size: 20 }).base32, user.email);
      const r = await pool.query(
        `insert into auth.factors(id,user_id,secret) values($1,$2,$3) on conflict(user_id) do update set secret=excluded.secret where not auth.factors.verified returning id`,
        [randomUUID(), user.user_id, factor.secret.base32],
      );
      if (!r.rowCount) throw new ApiError(400, 'MFA_ALREADY_ENROLLED');
      return json({ id: r.rows[0].id, totp: { uri: factor.toString() } });
    }
    if (path === 'auth/mfa/verify' && post) {
      const input = z
        .object({ factorId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
        .parse(await bodyJson(request));
      await limit('mfa:' + user.user_id, 5);
      const f = (
        await pool.query(
          'select * from auth.factors where id=$1 and user_id=$2',
          [input.factorId, user.user_id],
        )
      ).rows[0];
      const delta = f
        ? totp(f.secret, user.email).validate({ token: input.code, window: 1 })
        : null;
      if (delta === null) throw new ApiError(400, 'MFA_CODE_REJECTED');
      const step = Math.floor(Date.now() / 30000) + delta;
      const updated = await pool.query(
        'update auth.factors set verified=true,last_step=$1 where id=$2 and last_step<$1 returning id',
        [step, f.id],
      );
      if (!updated.rowCount) throw new ApiError(400, 'MFA_CODE_REJECTED');
      await pool.query("update auth.sessions set aal='aal2' where id=$1", [
        user.id,
      ]);
      return json({ ok: true });
    }
    if (path === 'me' && !post) {
      const profile = await asUser(user, (db) =>
        db.query(
          `select ${columns.mosque_profiles} from mosque_profiles where id=$1`,
          [user.user_id],
        ),
      );
      return json({
        profile: profile.rows[0] ?? null,
        userId: user.user_id,
        aal: user.aal,
      });
    }
    if (path === 'records' && !post) {
      const table = url.searchParams.get('table') ?? '';
      if (!Object.hasOwn(columns, table))
        throw new ApiError(400, 'INVALID_INPUT');
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(url.searchParams.get('page') ?? 0);
      const order =
        table === 'mosque_prayers'
          ? 'name'
          : table === 'mosque_receiving'
            ? 'updated_at'
            : 'id';
      const r = await asUser(user, (db) =>
        db.query(
          `select ${columns[table]} from ${table} order by ${order} limit 50 offset $1`,
          [page * 50],
        ),
      );
      return json({ records: r.rows, page });
    }
    const rpc: Record<string, [string, string | null]> = {
      finances: ['mosque_financial_summary', null],
      activity: ['mosque_activity', 'activity'],
      'payment-names': ['mosque_payment_names', 'names'],
      invitations: ['mosque_invitation_list', 'invitations'],
    };
    if (Object.hasOwn(rpc, path) && !post) {
      const [name, key] = rpc[path];
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(url.searchParams.get('page') ?? 0);
      const r = await asUser(user, (db) =>
        db.query(
          `select ${name}(${path === 'invitations' ? '$1' : ''}) result`,
          path === 'invitations' ? [page] : [],
        ),
      );
      return json(key ? { [key]: r.rows[0].result, page } : r.rows[0].result);
    }
    if (path === 'command' && post) {
      const id = z.uuid().parse(request.headers.get('idempotency-key'));
      const body = commandSchema.parse(await bodyJson(request));
      const token =
        body.type === 'invite' ? signed(`invite:${user.user_id}:${id}`) : null;
      const r = await asUser(user, (db) =>
        db.query('select mosque_command($1,$2) result', [
          id,
          JSON.stringify(token ? { ...body, token } : body),
        ]),
      );
      return json(
        {
          ...r.rows[0].result,
          ...(token
            ? { invitationUrl: `${origin}/invite#token=${token}` }
            : {}),
        },
        201,
      );
    }
    if (path === 'files/upload' && post) {
      const bucket = z
        .enum(['payment-evidence', 'mosque-qr'])
        .parse(url.searchParams.get('bucket'));
      const bytes = await boundedBody(request, 5242880),
        type = imageType(bytes);
      if (request.headers.get('content-type') !== type.mime)
        throw new ApiError(415, 'IMAGE_TYPE_MISMATCH');
      const name = `${user.user_id}/${randomUUID()}.${type.extension}`;
      await asUser(user, async (db) => {
        await db.query(
          'insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',
          [bucket, name, user.user_id],
        );
        const dir = join(process.env.UPLOAD_DIR!, bucket, user.user_id);
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await writeFile(join(process.env.UPLOAD_DIR!, bucket, name), bytes, {
          flag: 'wx',
          mode: 0o600,
        });
      });
      return json({ path: name }, 201);
    }
    if (
      (path === 'files/download' && post) ||
      (path === 'files/content' && !post)
    ) {
      const input = fileRequest.parse(
        post
          ? await bodyJson(request)
          : {
              bucket: url.searchParams.get('bucket'),
              path: url.searchParams.get('path'),
            },
      );
      const exists = await asUser(user, (db) =>
        db.query(
          'select name from storage.objects where bucket_id=$1 and name=$2',
          [input.bucket, input.path],
        ),
      );
      if (!exists.rowCount) throw new ApiError(404, 'FILE_UNAVAILABLE');
      if (post) {
        const expiry = Date.now() + 60000,
          signature = signed(
            `${user.id}:${input.bucket}:${input.path}:${expiry}`,
          );
        return json({
          url: `${origin}/api/backend/files/content?${new URLSearchParams({ bucket: input.bucket, path: input.path, expiry: String(expiry), signature })}`,
          expiresIn: 60,
        });
      }
      const expiry = Number(url.searchParams.get('expiry'));
      if (
        !Number.isSafeInteger(expiry) ||
        expiry < Date.now() ||
        expiry > Date.now() + 60000 ||
        url.searchParams.get('signature') !==
          signed(`${user.id}:${input.bucket}:${input.path}:${expiry}`)
      )
        throw new ApiError(403, 'FILE_UNAVAILABLE');
      const bytes = await readFile(
        join(process.env.UPLOAD_DIR!, input.bucket, input.path),
      );
      return new Response(bytes, {
        headers: {
          'Content-Type': imageType(bytes).mime,
          'Content-Disposition': 'attachment',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    throw new ApiError(404, 'NOT_FOUND');
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.code }, e.status);
    if (e instanceof z.ZodError) return json({ error: 'INVALID_INPUT' }, 400);
    const code = (e as { code?: string }).code;
    const mapped: Record<string, [number, string]> = {
      '42501': [403, 'PERMISSION_OR_MFA_REQUIRED'],
      '23505': [409, 'CONFLICT'],
      '22023': [400, 'INVALID_COMMAND'],
      '23514': [400, 'INVALID_COMMAND'],
      P0001: [429, 'RATE_LIMITED'],
    };
    if (code && mapped[code])
      return json({ error: mapped[code][1] }, mapped[code][0]);
    console.error('Local API failure', code ?? (e as Error).name);
    return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  }
}
const server = createServer(async (req, res) => {
  try {
    const controller = new AbortController();
    req.on('aborted', () => controller.abort());
    const request = new Request(`${origin}${req.url}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      ...(req.method === 'POST'
        ? { body: req as unknown as ReadableStream, duplex: 'half' }
        : {}),
      signal: controller.signal,
    } as RequestInit);
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end();
  }
});
server.requestTimeout = 30000;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  server.listen(3001, '127.0.0.1', () => console.log('Local API ready'));

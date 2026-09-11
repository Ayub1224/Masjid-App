import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHmac,
} from 'node:crypto';
import { promisify } from 'node:util';
import nodemailer from 'nodemailer';
import { pool, type Identity } from './db';
import { ApiError, cookie } from '../lib/server/http';
const scrypt = promisify(scryptCallback);
export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const opaque = () => Buffer.from(randomBytes(32)).toString('hex');
export function signed(value: string) {
  return createHmac('sha256', process.env.INVITATION_SECRET!)
    .update(value)
    .digest('hex');
}
export async function pinHash(pin: string, salt = opaque()) {
  const derived = (await scrypt(
    `${pin}:${process.env.PIN_PEPPER}`,
    salt,
    64,
  )) as Buffer;
  return `${salt}:${Buffer.from(derived).toString('hex')}`;
}
export async function pinMatches(pin: string, stored: string | null) {
  const target = stored ?? `${'0'.repeat(64)}:${'0'.repeat(128)}`;
  const candidate = await pinHash(pin, target.split(':')[0]);
  return (
    stored !== null &&
    timingSafeEqual(Buffer.from(candidate), Buffer.from(target))
  );
}
export async function limit(key: string, max = 10) {
  const r = await pool.query(
    `insert into auth.attempts(key) values($1) on conflict(key) do update set attempts=case when auth.attempts.started_at<now()-interval '15 minutes' then 1 else auth.attempts.attempts+1 end,started_at=case when auth.attempts.started_at<now()-interval '15 minutes' then now() else auth.attempts.started_at end returning attempts`,
    [hash(key)],
  );
  if (r.rows[0].attempts > max) throw new ApiError(429, 'RATE_LIMITED');
}
export async function identity(request: Request): Promise<Identity> {
  const token = cookie(request, 'mosque-local-session');
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(401, 'SIGN_IN_REQUIRED');
  const r = await pool.query(
    `select s.*,u.email from auth.sessions s join auth.users u on u.id=s.user_id where token_hash=$1 and not_after>now() and u.email_confirmed_at is not null`,
    [hash(token)],
  );
  if (!r.rowCount) throw new ApiError(401, 'SIGN_IN_REQUIRED');
  return r.rows[0];
}
export function sessionCookie(
  response: Response,
  token: string,
  seconds = 43200,
) {
  response.headers.append(
    'Set-Cookie',
    `mosque-local-session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}`,
  );
  return response;
}
export async function newSession(
  userId: string,
  recovery = false,
  remember = false,
) {
  const token = opaque();
  const seconds = remember ? 1209600 : 43200;
  await pool.query(
    `insert into auth.sessions(id,user_id,not_after,token_hash,recovery) values(gen_random_uuid(),$1,now()+$2*interval '1 second',$3,$4)`,
    [userId, seconds, hash(token), recovery],
  );
  return { token, seconds };
}
export async function sendLink(
  userId: string,
  email: string,
  type: 'signup' | 'recovery',
) {
  const token = opaque();
  await pool.query(
    "insert into auth.links(hash,user_id,type,expires_at) values($1,$2,$3,now()+interval '1 hour')",
    [hash(token), userId, type],
  );
  const page = type === 'signup' ? 'invite' : 'forgot-password';
  const url = `${process.env.APP_ORIGIN}/${page}?token_hash=${token}&type=${type}`;
  await nodemailer
    .createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
    })
    .sendMail({
      from: 'Mosque App <local@mosque.test>',
      to: email,
      subject: 'Your local mosque account',
      text: `Open this link to confirm your email and continue. It expires in one hour.\n\n${url}`,
    });
}

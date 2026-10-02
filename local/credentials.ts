import { z } from 'zod';
import { pool } from './db';
import { ApiError } from '../lib/server/http';
import { indianMobile } from '../lib/administrator-invitation';
export const loginInput = z.object({
  identifier: z.string().trim().min(3).max(254),
  pin: z.string().max(128).optional(),
  password: z.string().max(128).optional(),
  captchaToken: z.string().optional(),
  remember: z.boolean().default(false),
});
export function method(role: string) {
  return role === 'owner' || role === 'super-admin'
    ? { kind: 'password' as const, digits: 0 }
    : { kind: 'pin' as const, digits: role === 'admin' ? 6 : 4 };
}
export function credential(
  input: { pin?: string; password?: string },
  role: string,
) {
  const spec = method(role),
    value = spec.kind === 'password' ? input.password : input.pin;
  if (
    !value ||
    (spec.kind === 'password'
      ? value.length < 12 || value.length > 128
      : !new RegExp(`^\\d{${spec.digits}}$`).test(value))
  )
    throw new ApiError(400, 'INVALID_CREDENTIAL_FORMAT');
  return value;
}
export async function findAccount(identifier: string) {
  const email = identifier.includes('@')
    ? identifier.trim().toLowerCase()
    : null;
  const digits = indianMobile(identifier)?.slice(1) ?? '';
  const r = await pool.query(
    `select u.*,coalesce(p.role,u.credential_role) role from auth.users u left join mosque_profiles p on p.id=u.id where (p.active is true or p.id is null) and (case when $1::text is not null then u.email=$1 else regexp_replace(p.phone,'[^0-9]','','g')=$2 end)`,
    [email, digits],
  );
  return r.rowCount === 1 ? r.rows[0] : null;
}

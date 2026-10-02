import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { pool } from './db';
import { ApiError } from '../lib/server/http';
import { credential, method } from './credentials';
import { hash, pinHash, pinMatches, newSession } from './security';

export type Invitation = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  address: string;
  role: 'owner' | 'admin' | 'member';
  permissions: string[];
  expires_at: Date;
  revoked_at: Date | null;
  accepted_at: Date | null;
};
export function invitationDestination(role: string) {
  return role === 'member' ? '/home' : '/admin';
}
export async function readInvitation(
  token: string,
  db: Pick<PoolClient, 'query'> = pool,
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(400, 'INVITATION_UNAVAILABLE');
  const invite = (
    await db.query<Invitation>(
      'select * from mosque_private.invitations where token_hash=$1',
      [Buffer.from(hash(token), 'hex')],
    )
  ).rows[0];
  if (!invite || invite.revoked_at)
    throw new ApiError(410, 'INVITATION_UNAVAILABLE');
  if (invite.accepted_at) throw new ApiError(410, 'INVITATION_USED');
  if (new Date(invite.expires_at).getTime() <= Date.now())
    throw new ApiError(410, 'INVITATION_EXPIRED');
  return invite;
}
export async function invitationAccount(
  invite: Invitation,
  db: Pick<PoolClient, 'query'> = pool,
) {
  const rows = (
    await db.query(
      "select u.*,p.id membership_id from auth.users u left join public.mosque_profiles p on p.id=u.id where ($1::text is not null and u.email=$1) or ($2 <> '' and u.phone=$2)",
      [invite.email, invite.phone],
    )
  ).rows;
  if (rows.length > 1 || rows[0]?.membership_id)
    throw new ApiError(409, 'INVITATION_ACCOUNT_EXISTS');
  return rows[0];
}
// Caller must hold the register lock and have proved the invitation or the
// invited email. Profile creation, acceptance, audit and session are one commit.
async function complete(db: PoolClient, invite: Invitation, userId: string) {
  if (
    invite.accepted_at ||
    invite.revoked_at ||
    new Date(invite.expires_at).getTime() <= Date.now()
  )
    throw new ApiError(410, 'INVITATION_UNAVAILABLE');
  await db.query(
    'insert into public.mosque_profiles(id,name,email,phone,address,role,permissions) values($1,$2,$3,$4,$5,$6,$7)',
    [
      userId,
      invite.name,
      invite.email,
      invite.phone,
      invite.address,
      invite.role,
      invite.permissions,
    ],
  );
  await db.query(
    'update mosque_private.invitations set accepted_at=now() where id=$1',
    [invite.id],
  );
  await db.query(
    'insert into mosque_private.audit(actor,action,target) values($1,$2,$1)',
    [userId, 'accept-invite'],
  );
}
export async function registerInvitation(
  input: {
    invitationToken: string;
    identifier?: string;
    password?: string;
    pin?: string;
  },
  currentUserId?: string,
) {
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(91240909)');
    const invite = await readInvitation(input.invitationToken, db);
    if (input.identifier) {
      const { indianMobile } = await import('../lib/administrator-invitation');
      if (
        input.identifier.trim().toLowerCase() !== invite.email &&
        indianMobile(input.identifier) !== invite.phone
      )
        throw new ApiError(400, 'INVITATION_UNAVAILABLE');
    }
    const account = await invitationAccount(invite, db);
    if (currentUserId && currentUserId !== account?.id)
      throw new ApiError(409, 'INVITATION_ACCOUNT_MISMATCH');
    const secret = credential(input, invite.role);
    if (account && !(await pinMatches(secret, account.pin_hash)))
      throw new ApiError(401, 'INVALID_CREDENTIALS');
    const userId = account?.id ?? randomUUID();
    if (account) {
      await db.query(
        "update auth.users set activated_at=now(),credential_role=$2,phone=nullif($3,'') where id=$1",
        [userId, invite.role, invite.phone],
      );
    } else {
      await db.query(
        "insert into auth.users(id,email,phone,pin_hash,credential_role,activated_at) values($1,$2,nullif($3,''),$4,$5,now())",
        [
          userId,
          invite.email,
          invite.phone,
          await pinHash(secret),
          invite.role,
        ],
      );
    }
    await complete(db, invite, userId);
    const session = await newSession(userId, false, false, db);
    await db.query('commit');
    return {
      session,
      role: invite.role,
      destination: invitationDestination(invite.role),
      joined: true,
    };
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    db.release();
  }
}
// Compatibility for confirmation links already sent by the old signup flow.
// A verified email can claim only its single pending invitation.
export async function completeConfirmedInvitation(
  db: PoolClient,
  userId: string,
) {
  await db.query('select pg_advisory_xact_lock(91240909)');
  const user = (
    await db.query(
      'select u.email,u.email_confirmed_at,p.role from auth.users u left join public.mosque_profiles p on p.id=u.id where u.id=$1',
      [userId],
    )
  ).rows[0];
  if (user?.role) return invitationDestination(user.role);
  if (!user?.email_confirmed_at || !user.email) return null;
  const invites = (
    await db.query<Invitation>(
      'select * from mosque_private.invitations where email=$1 and accepted_at is null and revoked_at is null and expires_at>now() for update',
      [user.email],
    )
  ).rows;
  if (invites.length !== 1) throw new ApiError(410, 'INVITATION_UNAVAILABLE');
  await complete(db, invites[0], userId);
  await db.query(
    "update auth.users set activated_at=now(),credential_role=$2,phone=nullif($3,'') where id=$1",
    [userId, invites[0].role, invites[0].phone],
  );
  return invitationDestination(invites[0].role);
}
export async function previewInvitation(token: string) {
  const invite = await readInvitation(token);
  const account = await invitationAccount(invite);
  const mosque = (
    await pool.query('select name from public.mosque_details limit 1')
  ).rows[0];
  return {
    name: invite.name,
    role: invite.role,
    identifier: invite.email || invite.phone,
    method: method(invite.role),
    existingAccount: !!account,
    mosqueName: mosque?.name || 'your mosque',
  };
}

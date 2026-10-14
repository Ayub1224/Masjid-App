import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, type Identity } from './db';
import { pinHash, signed } from './security';
import { ApiError } from '../lib/server/http';
import { bulkMembersInput, bulkRemoveInput } from '../lib/bulk-members';

export async function bulkMembers(
  user: Identity,
  requestId: string | null,
  raw: unknown,
  remove = false,
) {
  const key = z.uuid().parse(requestId);
  const input = remove
    ? bulkRemoveInput.parse(raw)
    : bulkMembersInput.parse(raw);
  // Keyed fingerprint prevents a database-only attacker guessing temporary PINs.
  const fingerprint = Buffer.from(
    signed(JSON.stringify({ remove, input })),
    'hex',
  );
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(91240909)');
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [
        user.user_id,
        JSON.stringify({
          sub: user.user_id,
          session_id: user.id,
          aal: user.aal,
        }),
      ],
    );
    const allowed = (
      await db.query("select mosque_private.allowed('members') allowed")
    ).rows[0].allowed;
    if (!allowed) throw new ApiError(403, 'PERMISSION_OR_MFA_REQUIRED');
    const prior = (
      await db.query(
        'select body_hash,result from mosque_private.commands where actor=$1 and request_id=$2',
        [user.user_id, key],
      )
    ).rows[0];
    if (prior) {
      if (!prior.body_hash.equals(fingerprint))
        throw new ApiError(409, 'CONFLICT');
      await db.query('commit');
      return prior.result;
    }
    const ids: string[] = [];
    if ('members' in input) {
      if (!(await db.query('select 1 from mosque_details')).rowCount)
        throw new ApiError(400, 'MOSQUE_DETAILS_REQUIRED');
      for (const [index, member] of input.members.entries()) {
        const conflict = await db.query(
          `select 1 from auth.users where phone=$1
          union all select 1 from mosque_profiles where regexp_replace(phone,'[^0-9]','','g') in ($2,$3)
          union all select 1 from mosque_private.invitations where phone=$1 and accepted_at is null and revoked_at is null and expires_at>now()`,
          [member.phone, member.phone.slice(1), member.phone.slice(3)],
        );
        if (conflict.rowCount)
          throw new ApiError(409, `MEMBER_ROW_${index + 1}_PHONE_IN_USE`);
      }
      for (const member of input.members) {
        const id = randomUUID();
        await db.query(
          "insert into auth.users(id,phone,pin_hash,credential_role,activated_at,must_change_pin) values($1,$2,$3,'member',now(),true)",
          [id, member.phone, await pinHash(member.pin)],
        );
        await db.query(
          "insert into mosque_profiles(id,name,phone,address,role) values($1,$2,$3,$4,'member')",
          [id, member.name, member.phone, member.address],
        );
        ids.push(id);
      }
    } else {
      const targets = await db.query(
        "select id from mosque_profiles where id=any($1::uuid[]) and role='member' and active for update",
        [input.ids],
      );
      if (targets.rowCount !== input.ids.length)
        throw new ApiError(400, 'ACTIVE_MEMBERS_ONLY');
      await db.query(
        'update mosque_profiles set active=false where id=any($1::uuid[])',
        [input.ids],
      );
      await db.query(
        'delete from auth.sessions where user_id=any($1::uuid[])',
        [input.ids],
      );
      ids.push(...input.ids);
    }
    for (const id of ids)
      await db.query(
        'insert into mosque_private.audit(actor,action,target) values($1,$2,$3)',
        [user.user_id, remove ? 'bulk-remove-member' : 'bulk-add-member', id],
      );
    const result = { ids, count: ids.length };
    await db.query(
      'insert into mosque_private.commands(actor,request_id,body_hash,result) values($1,$2,$3,$4)',
      [user.user_id, key, fingerprint, result],
    );
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    db.release();
  }
}

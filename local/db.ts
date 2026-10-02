import pg from 'pg';
// Business dates are calendar dates, not timestamps in the server timezone.
pg.types.setTypeParser(1082, (value) => value);
const connection = new URL(process.env.DATABASE_URL!);
if (process.env.LOCAL_TEST === 'true' && process.env.LOCAL_TEST_DATABASE) {
  if (!/^mosque_browser_[a-z0-9_]+$/.test(process.env.LOCAL_TEST_DATABASE))
    throw Error('Invalid browser test database');
  connection.pathname = '/' + process.env.LOCAL_TEST_DATABASE;
}
export const pool = new pg.Pool({
  connectionString: connection.toString(),
  max: 10,
});
export type Identity = {
  id: string;
  user_id: string;
  aal: string;
  email: string;
  recovery: boolean;
};
export async function asUser<T>(
  session: Identity | null,
  run: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [
        session?.user_id ?? '',
        JSON.stringify(
          session
            ? { sub: session.user_id, session_id: session.id, aal: session.aal }
            : {},
        ),
      ],
    );
    await db.query(
      session ? 'set local role authenticated' : 'set local role anon',
    );
    const result = await run(db);
    await db.query('commit');
    return result;
  } catch (e) {
    await db.query('rollback');
    throw e;
  } finally {
    db.release();
  }
}

import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  captcha: vi.fn(),
}));
vi.mock('../lib/server/supabase', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/server/supabase')>();
  const client = {
    rpc: mocks.rpc,
    auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp },
  };
  return {
    ...actual,
    captcha: mocks.captcha,
    supabase: () => client,
    authenticated: async () => ({
      client,
      user: {
        id: '00000000-0000-4000-8000-000000000003',
        email: 'admin@example.com',
      },
      token: 'test',
    }),
  };
});
import { POST } from '../app/api/backend/[...path]/route';
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('APP_ORIGIN', 'https://mosque.example');
  for (const key of ['PIN_PEPPER', 'LOGIN_GATE_SECRET', 'INVITATION_SECRET'])
    vi.stubEnv(key, ('test-' + key).repeat(10));
  mocks.captcha.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function post(path: string, body: object, key?: string) {
  return POST(
    new Request('https://mosque.example/api/backend/' + path, {
      method: 'POST',
      headers: {
        Origin: 'https://mosque.example',
        'Content-Type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}
it('connects phone/PIN login to the protected identity resolver and sets HttpOnly cookies', async () => {
  mocks.rpc.mockResolvedValue({ data: 'member@example.com', error: null });
  mocks.signIn.mockResolvedValue({
    data: {
      session: {
        access_token: 'access-test',
        refresh_token: 'refresh-test',
        expires_in: 3600,
      },
    },
    error: null,
  });
  const response = await post('auth/login', {
    identifier: '+919876543210',
    pin: '123456',
    captchaToken: 'test',
    remember: true,
  });
  expect(response.status).toBe(200);
  expect(mocks.captcha).toHaveBeenCalledWith('test');
  expect(mocks.rpc.mock.calls[0][0]).toBe('mosque_login_identity');
  expect(mocks.signIn.mock.calls[0][0].email).toBe('member@example.com');
  expect(mocks.signIn.mock.calls[0][0].password).toHaveLength(64);
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(await response.json()).toEqual({ ok: true });
});
it('rejects throttled or ambiguous identifiers before checking the PIN', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  expect(
    (
      await post('auth/login', {
        identifier: '+919876543210',
        pin: '123456',
        captchaToken: 'test',
      })
    ).status,
  ).toBe(401);
  expect(mocks.signIn).not.toHaveBeenCalled();
});
it('registers only with a valid invitation and derives the same PIN credential contract', async () => {
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.signUp.mockResolvedValue({ error: null });
  const response = await post('auth/register', {
    identifier: 'member@example.com',
    pin: '123456',
    captchaToken: 'test',
    invitationToken: 'a'.repeat(64),
  });
  expect(response.status).toBe(202);
  expect(mocks.signUp.mock.calls[0][0].email).toBe('member@example.com');
  expect(mocks.signUp.mock.calls[0][0].password).toHaveLength(64);
});
it('reuses the same invitation token when the same command is retried', async () => {
  mocks.rpc.mockResolvedValue({ data: { id: 'test-invite' }, error: null });
  const key = crypto.randomUUID(),
    body = {
      type: 'invite',
      name: 'Test',
      email: 'member@example.com',
      phone: '',
      address: '',
      role: 'member',
      permissions: [],
    };
  const first = await post('command', body, key),
    second = await post('command', body, key);
  expect(first.status).toBe(201);
  expect(await second.json()).toEqual(await first.json());
  expect(mocks.rpc.mock.calls[0][1].body.token).toHaveLength(64);
  expect(mocks.rpc.mock.calls[1][1].body.token).toBe(
    mocks.rpc.mock.calls[0][1].body.token,
  );
});

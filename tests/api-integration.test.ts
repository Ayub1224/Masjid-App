import { it, expect, vi, afterEach } from 'vitest';
import {
  api,
  mutate,
  readData,
  clearPrivateClientState,
} from '../lib/data/api';
import { createSeed } from '../lib/data/domain';
import { credentials, commandSchema } from '../lib/server/validation';
import { pinPassword, keyedToken } from '../lib/server/pin';
import spec from '../public/openapi.json';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  clearPrivateClientState();
});
it('loads administrators without unrelated finance or public requests', async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('records?table=mosque_profiles'))
      return Response.json({ records: [] });
    if (url.includes('invitations?page='))
      return Response.json({ invitations: [] });
    throw Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const result = await readData(
    {
      userId: 'admin',
      aal: 'aal2',
      profile: {
        id: 'admin',
        name: 'Admin',
        email: 'admin@example.com',
        phone: '',
        address: '',
        role: 'super-admin',
        active: true,
        permissions: [],
      },
    },
    '/super-admin',
  );
  expect(result.members).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('propagates navigation cancellation to requests and stops pagination', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const pending = readData(null, 'all', controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({
    name: 'AbortError',
  });
  controller.abort();
  await rejected;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('retries an uncertain financial result with the same idempotency key', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Network lost'))
    .mockResolvedValueOnce(Response.json({ id: 'saved' }));
  vi.stubGlobal('fetch', fetcher);
  const body = {
    type: 'cash',
    memberId: 'member',
    amountPaise: 100,
    date: '2026-01-01',
    purpose: 'Donation',
  };
  await expect(
    api('command', body, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),
  ).rejects.toThrow();
  await api('command', body, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
  expect(
    new Headers(fetcher.mock.calls[0][1].headers).get('Idempotency-Key'),
  ).toBe(new Headers(fetcher.mock.calls[1][1].headers).get('Idempotency-Key'));
});
it('maps every existing page action into validated wire commands', async () => {
  const fetcher = vi.fn().mockImplementation((_url, init) => {
    expect(commandSchema.safeParse(JSON.parse(init.body)).success).toBe(true);
    return Promise.resolve(Response.json({ id: 'saved' }));
  });
  vi.stubGlobal('fetch', fetcher);
  const data = createSeed();
  await mutate({ type: 'prayers', prayers: data.prayers }, data);
  await mutate(
    {
      type: 'expense',
      expense: {
        amount: 100,
        date: '2026-01-01',
        category: 'Other',
        description: 'Soap',
        account: 'Cash',
        status: 'draft',
      },
    },
    data,
  );
  await mutate(
    {
      type: 'notice',
      notice: {
        title: 'Meeting',
        body: 'Details',
        hindiTitle: '',
        hindiBody: '',
        date: '2026-01-01',
        published: false,
        image: '',
      },
    },
    data,
  );
  await mutate(
    {
      type: 'invite',
      member: {
        name: 'Test',
        email: 'test@example.com',
        phone: '',
        address: '',
        role: 'member',
        permissions: [],
      },
    },
    data,
  );
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it('never substitutes sample members or balances when the live public timetable is empty', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ prayers: [], news: [] })),
  );
  const state = await readData(null);
  expect(state.members).toEqual([]);
  expect(state.payments).toEqual([]);
  expect(state.prayers).toEqual([]);
  expect(state.balance?.total).toBe(0);
});
it('derives a different protected credential per email and rejects unconfigured pepper', async () => {
  vi.stubEnv('PIN_PEPPER', '');
  await expect(pinPassword('a@example.com', '123456')).rejects.toThrow(
    'AUTH_NOT_CONFIGURED',
  );
  vi.stubEnv('PIN_PEPPER', 'test-pepper-'.repeat(8));
  expect(await pinPassword('a@example.com', '123456')).not.toBe(
    await pinPassword('b@example.com', '123456'),
  );
  expect(await pinPassword(' A@example.com ', '123456')).toBe(
    await pinPassword('a@example.com', '123456'),
  );
  expect(await pinPassword('a@example.com', '123456')).toHaveLength(64);
  vi.stubEnv('INVITATION_SECRET', 'test-invitation-'.repeat(8));
  expect(await keyedToken('actor:request', 'INVITATION_SECRET')).toBe(
    await keyedToken('actor:request', 'INVITATION_SECRET'),
  );
});
it('validates PIN input and documents all current command variants', () => {
  expect(
    credentials.safeParse({
      identifier: 'a@example.com',
      pin: '123456',
      captchaToken: 'test',
    }).success,
  ).toBe(true);
  expect(
    credentials.safeParse({
      identifier: 'a@example.com',
      pin: '123',
      captchaToken: 'test',
    }).success,
  ).toBe(false);
  const variants = spec.components.schemas.Command as unknown as {
    oneOf?: unknown[];
    anyOf?: unknown[];
  };
  expect((variants.oneOf ?? variants.anyOf)?.length).toBe(
    commandSchema.options.length,
  );
  expect(spec.openapi).toBe('3.1.0');
  expect(Object.keys(spec.paths)).toHaveLength(22);
});

import type { DemoState, Member, Notice, Payment, Expense } from './domain';
import type { Action } from './repository';
import type { Prayer } from '@/config/mosque';
import { initialPrayers } from '@/config/mosque';
export class BackendError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(
      (
        {
          PERMISSION_OR_MFA_REQUIRED:
            'Permission denied. Administrators must verify their authenticator code.',
          SIGN_IN_REQUIRED: 'Please sign in again.',
          CONFLICT:
            'This record conflicts with an existing entry. Refresh and check it.',
          INVALID_COMMAND:
            'The record changed or the values are invalid. Refresh and try again.',
          BACKEND_NOT_CONFIGURED: 'The backend is not configured yet.',
          ACCOUNT_OR_INVITATION_UNAVAILABLE:
            'No active account or valid invitation was found. Check your details or contact your mosque administrator.',
          ACCOUNT_NOT_FOUND:
            'No matching mosque account was found. Check your email or phone number.',
          INVALID_CREDENTIAL_FORMAT:
            'Enter the password or PIN requested for this account.',
          RATE_LIMITED: 'Too many attempts. Please wait before trying again.',
        } as Record<string, string>
      )[code] ?? code.replaceAll('_', ' ').toLowerCase(),
    );
  }
}
let refresh: Promise<unknown> | undefined;
const uncertainCommands = new Map<string, string>();
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const fingerprint = path === 'command' ? JSON.stringify(body) : undefined;
  if (fingerprint) {
    const key =
      uncertainCommands.get(fingerprint) ??
      headers.get('Idempotency-Key') ??
      crypto.randomUUID();
    uncertainCommands.set(fingerprint, key);
    headers.set('Idempotency-Key', key);
  }
  const response = await fetch(`/api/backend/${path}`, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
    method: body === undefined ? (init.method ?? 'GET') : 'POST',
    credentials: 'same-origin',
    headers,
    body: body === undefined ? init.body : JSON.stringify(body),
  });
  if (
    response.status === 401 &&
    retry &&
    ![
      'auth/login',
      'auth/identify',
      'auth/register',
      'auth/refresh',
      'auth/recover',
      'auth/confirm',
    ].includes(path)
  ) {
    refresh ??= api('auth/refresh', {}, {}, false).finally(() => {
      refresh = undefined;
    });
    await refresh;
    return api<T>(path, body, init, false);
  }
  const data = await response.json();
  if (
    fingerprint &&
    (response.ok ||
      (response.status >= 400 &&
        response.status < 500 &&
        response.status !== 401))
  )
    uncertainCommands.delete(fingerprint);
  if (!response.ok)
    throw new BackendError(
      response.status,
      (data as { error?: string }).error ?? 'SERVICE_UNAVAILABLE',
    );
  return data as T;
}
// Wire records are server-selected columns; convert snake_case exactly once here.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role: 'member' | 'admin' | 'owner' | 'super-admin';
  permissions: Member['permissions'];
  active: boolean;
};
export type Session = { profile: Profile | null; userId: string; aal: string };
export async function readSession(): Promise<Session | null> {
  try {
    return await api<Session>('me');
  } catch (e) {
    if (e instanceof BackendError && e.status === 401) return null;
    throw e;
  }
}
async function all(table: string, signal?: AbortSignal): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; page <= 10000; page++) {
    const batch = await api<{ records: Row[] }>(
      `records?table=${table}&page=${page}`,
      undefined,
      { signal },
    );
    rows.push(...batch.records);
    if (batch.records.length < 50) return rows;
  }
  throw Error(
    'Too many records to load. Please contact the mosque administrator.',
  );
}
const notice = (n: Row): Notice => ({
  id: n.id,
  title: n.title,
  body: n.body,
  hindiTitle: n.hindi_title,
  hindiBody: n.hindi_body,
  date: n.event_on,
  published: n.published ?? true,
  image: n.image_url ?? undefined,
});
const prayers = (rows: Row[]): Prayer[] =>
  rows.map((p) => ({
    id: p.name.toLowerCase(),
    hindi: initialPrayers.find((v) => v.name === p.name)?.hindi ?? p.name,
    name: p.name,
    adhan: p.adhan.slice(0, 5),
    jamaat: p.jamaat.slice(0, 5),
  }));
export async function readData(
  session: Session | null,
  scope = 'all',
  signal?: AbortSignal,
): Promise<DemoState> {
  const groups: Record<string, string[]> = {
    '/super-admin': ['profiles', 'invitations'],
    '/admin/administrators': ['profiles', 'invitations'],
    '/admin/members': ['profiles', 'invitations'],
    '/admin/payments': ['payments', 'names'],
    '/admin/cash': ['profiles', 'payments'],
    '/admin/expenses': ['expenses'],
    '/admin/prayers': ['public'],
    '/admin/news': ['news'],
    '/admin/receiving': ['receiving'],
    '/admin/balance': ['checks', 'finance'],
  };
  const needs = (group: string) =>
    !groups[scope] || groups[scope].includes(group);
  const pub = needs('public')
    ? await api<{ prayers: Row[]; news: Row[] }>('public', undefined, {
        signal,
      })
    : { prayers: [], news: [] };
  const state: DemoState = {
    members: [],
    payments: [],
    expenses: [],
    prayers: prayers(pub.prayers),
    notices: pub.news.map(notice),
    checks: [],
    audit: [],
    receiving: { upi: '', recipient: '' },
    transfers: [],
    balance: { bank: 0, cash: 0, total: 0 },
    monthly: [],
  };
  if (!session?.profile?.active) return state;
  const [members, payments, expenses, checks, news, receiving, finance] =
    await Promise.all([
      needs('profiles') ? all('mosque_profiles', signal) : [],
      needs('payments') ? all('mosque_payments', signal) : [],
      needs('expenses') ? all('mosque_expenses', signal) : [],
      needs('checks') ? all('mosque_balance_checks', signal) : [],
      needs('news') ? all('mosque_news', signal) : [],
      needs('receiving') ? all('mosque_receiving', signal) : [],
      needs('finance')
        ? api<{
            balance: { bankPaise: number; cashPaise: number };
            months: NonNullable<DemoState['monthly']>;
          }>('finances', undefined, { signal })
        : { balance: { bankPaise: 0, cashPaise: 0 }, months: [] },
    ]);
  state.members = members
    .filter((m) => m.role !== 'super-admin')
    .map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      address: m.address,
      role: m.role,
      permissions: m.permissions,
      status: m.active ? 'active' : 'inactive',
    }));
  state.payments = payments.map(
    (p): Payment => ({
      id: p.id,
      memberId: p.member_id,
      amount: Number(p.amount_paise),
      date: p.paid_on,
      purpose: p.purpose,
      method: p.method,
      reference: p.reference ?? '',
      status: p.status,
      reason: p.reason,
      evidencePath: p.evidence_path ?? undefined,
    }),
  );
  state.expenses = expenses.map(
    (e): Expense => ({
      id: e.id,
      amount: Number(e.amount_paise),
      date: e.paid_on,
      category: e.category,
      description: e.description,
      account: e.account,
      status: e.status,
      reason: e.reason,
    }),
  );
  state.checks = checks.map((c) => ({
    id: c.id,
    amount: Number(c.observed_paise),
    recorded: Number(c.recorded_paise),
    date: c.as_of,
    note: c.note,
  }));
  state.notices = news.map(notice);
  state.balance = {
    bank: Number(finance.balance.bankPaise),
    cash: Number(finance.balance.cashPaise),
    total:
      Number(finance.balance.bankPaise) + Number(finance.balance.cashPaise),
  };
  state.monthly = finance.months;
  if (receiving[0]) {
    const r = receiving[0];
    const file = r.qr_path
      ? await api<{ url: string }>(
          'files/download',
          {
            bucket: 'mosque-qr',
            path: r.qr_path,
          },
          { signal },
        )
      : { url: undefined };
    state.receiving = {
      upi: r.upi,
      recipient: r.recipient,
      image: file.url,
      qrPath: r.qr_path,
    };
  }
  const p = session.profile;
  if (
    needs('names') &&
    (session.aal === 'aal2' || p.role === 'admin') &&
    (p.role === 'owner' ||
      (p.role === 'admin' &&
        p.permissions.some((v) => ['verify', 'record', 'reports'].includes(v))))
  ) {
    state.memberNames = (
      await api<{ names: Record<string, string> }>('payment-names', undefined, {
        signal,
      })
    ).names;
  }
  if (
    needs('activity') &&
    (session.aal === 'aal2' || p.role === 'admin') &&
    p.role !== 'member' &&
    (p.role !== 'admin' || p.permissions.length > 0)
  ) {
    const result = await api<{
      activity: { action: string; created_at: string }[];
    }>('activity', undefined, { signal });
    state.audit = result.activity.map(
      (e) =>
        `${new Date(e.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · ${e.action}`,
    );
  }
  if (
    needs('invitations') &&
    (session.aal === 'aal2' || p.role === 'admin') &&
    (p.role === 'owner' ||
      p.role === 'super-admin' ||
      p.permissions.includes('members'))
  ) {
    for (let page = 0; page <= 10000; page++) {
      const batch = await api<{ invitations: Row[] }>(
        `invitations?page=${page}`,
        undefined,
        { signal },
      );
      state.members.push(
        ...batch.invitations
          .filter((i) => !i.accepted_at && !i.revoked_at)
          .map(
            (i): Member => ({
              id: i.id,
              name: i.name,
              email: i.email,
              phone: i.phone,
              address: i.address,
              role: i.role,
              permissions: i.permissions,
              status: 'invited',
              expiresAt: Date.parse(i.expires_at),
            }),
          ),
      );
      if (batch.invitations.length < 50) break;
    }
  }
  return state;
}
async function upload(data: string | undefined, bucket: string) {
  if (!data?.startsWith('data:image/'))
    throw Error('Choose an image to upload.');
  const blob = await (await fetch(data)).blob();
  return (
    await api<{ path: string }>(`files/upload?bucket=${bucket}`, undefined, {
      method: 'POST',
      body: blob,
      headers: { 'Content-Type': blob.type },
    })
  ).path;
}
const preparedActions = new Map<string, unknown>();
export const invitationLinks = new Map<string, string>();
export async function mutate(
  a: Action,
  state: DemoState,
): Promise<{ id: string }> {
  const actionKey = JSON.stringify(a);
  let body: unknown = a;
  if (preparedActions.has(actionKey)) body = preparedActions.get(actionKey);
  else
    switch (a.type) {
      case 'prayers':
        body = {
          type: a.type,
          prayers: a.prayers.map(({ name, adhan, jamaat }) => ({
            name,
            adhan,
            jamaat,
          })),
        };
        break;
      case 'submit':
        body = {
          type: a.type,
          amountPaise: a.payment.amount,
          date: a.payment.date,
          purpose: a.payment.purpose,
          reference: a.payment.reference,
          evidencePath: await upload(a.payment.evidence, 'payment-evidence'),
        };
        break;
      case 'cash':
        body = {
          type: a.type,
          amountPaise: a.payment.amount,
          date: a.payment.date,
          purpose: a.payment.purpose,
          memberId: a.payment.memberId,
        };
        break;
      case 'expense':
        body = {
          type: a.type,
          amountPaise: a.expense.amount,
          date: a.expense.date,
          category: a.expense.category,
          description: a.expense.description,
          account: a.expense.account,
          status: a.expense.status,
        };
        break;
      case 'invite':
        body = { type: a.type, ...a.member };
        break;
      case 'member-status': {
        const member = state.members.find((m) => m.id === a.id);
        body = {
          type:
            member?.status === 'invited'
              ? 'revoke-invite'
              : a.status === 'inactive'
                ? 'deactivate'
                : 'reactivate',
          id: a.id,
        };
        break;
      }
      case 'reverse':
        body = { type: a.type, id: a.id, reason: a.reason };
        break;
      case 'balance-check':
        body = {
          type: a.type,
          amountPaise: a.amount,
          date: a.date,
          note: a.note,
        };
        break;
      case 'transfer':
        body = { type: a.type, amountPaise: a.amount, date: a.date };
        break;
      case 'notice':
        body = {
          type: a.type,
          title: a.notice.title,
          text: a.notice.body,
          hindiTitle: a.notice.hindiTitle,
          hindiBody: a.notice.hindiBody,
          date: a.notice.date,
          published: a.notice.published,
          image: a.notice.image,
        };
        break;
      case 'receiving':
        body = {
          type: a.type,
          upi: a.receiving.upi,
          recipient: a.receiving.recipient,
          qrPath: a.receiving.image?.startsWith('data:')
            ? await upload(a.receiving.image, 'mosque-qr')
            : state.receiving.qrPath,
        };
        break;
      case 'reset':
        throw Error('Live records cannot be reset.');
    }
  preparedActions.set(actionKey, body);
  const result = await api<{ id: string; invitationUrl?: string }>(
    'command',
    body,
    { headers: { 'Idempotency-Key': crypto.randomUUID() } },
  );
  preparedActions.delete(actionKey);
  if (result.invitationUrl)
    invitationLinks.set(result.id, result.invitationUrl);
  return result;
}
export function clearPrivateClientState() {
  invitationLinks.clear();
  uncertainCommands.clear();
  preparedActions.clear();
}

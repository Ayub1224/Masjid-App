import {
  createSeed,
  verifyPayment,
  validateSeat,
  can,
  balances,
  type DemoState,
  type Role,
  type Member,
  type Payment,
  type Expense,
  type Notice,
  type Permission,
} from './domain';
let state: DemoState | undefined;
const current = () => state ?? (state = createSeed());
const id = () => crypto.randomUUID();
export type Action =
  | {
      type: 'bulk-review';
      ids: string[];
      status: 'verified' | 'rejected';
      reason?: string;
    }
  | { type: 'submit'; payment: Omit<Payment, 'id' | 'status'> }
  | {
      type: 'review';
      id: string;
      status: 'verified' | 'rejected';
      reason?: string;
    }
  | {
      type: 'cash';
      payment: Omit<Payment, 'id' | 'status' | 'method' | 'reference'>;
    }
  | { type: 'invite'; member: Omit<Member, 'id' | 'status' | 'expiresAt'> }
  | { type: 'member-status'; id: string; status: 'inactive' | 'invited' }
  | { type: 'permissions'; id: string; permissions: Permission[] }
  | { type: 'expense'; expense: Omit<Expense, 'id'> }
  | { type: 'post-expense'; id: string }
  | { type: 'reverse'; id: string; kind: 'payment' | 'expense'; reason: string }
  | { type: 'balance-check'; amount: number; date: string; note: string }
  | { type: 'transfer'; amount: number; date: string }
  | { type: 'prayers'; prayers: DemoState['prayers'] }
  | { type: 'notice'; notice: Omit<Notice, 'id'> }
  | { type: 'toggle-notice'; id: string }
  | { type: 'receiving'; receiving: DemoState['receiving'] }
  | { type: 'reset' };
function requirePower(role: Role, p: Permission) {
  const admin = current().members.find((m) => m.id === 'a1');
  if (!can(role, p, admin?.status === 'active' ? admin.permissions : []))
    throw Error('This demo role does not have that permission.');
}
/** In-memory preview adapter. Replace with authenticated Supabase/API calls; not a security boundary. */
export const demoRepository = {
  async read() {
    return structuredClone(current());
  },
  async mutate(role: Role, a: Action) {
    let s = structuredClone(current());
    let resultId = '';
    switch (a.type) {
      case 'bulk-review':
        requirePower(role, 'verify');
        for (const paymentId of a.ids)
          s = verifyPayment(s, paymentId, a.status, a.reason);
        break;
      case 'submit':
        if (role === 'guest' || role === 'super-admin')
          throw Error('Open a member demo to contribute.');
        resultId = id();
        s.payments.unshift({
          ...a.payment,
          memberId: 'm1',
          id: resultId,
          status: 'pending',
        });
        break;
      case 'review':
        requirePower(role, 'verify');
        s = verifyPayment(s, a.id, a.status, a.reason);
        break;
      case 'cash':
        requirePower(role, 'record');
        resultId = id();
        s.payments.unshift({
          ...a.payment,
          id: resultId,
          status: 'verified',
          method: 'Cash',
          reference: '',
        });
        break;
      case 'invite':
        if (a.member.role !== 'member') {
          if (role !== 'super-admin')
            throw Error('Only super admin can invite administrators.');
          validateSeat(s, a.member.role);
        } else requirePower(role, 'members');
        if (
          s.members.some(
            (m) =>
              m.email.toLowerCase() === a.member.email.trim().toLowerCase(),
          )
        )
          throw Error('That email already has a member record.');
        resultId = id();
        s.members.push({
          ...a.member,
          email: a.member.email.trim().toLowerCase(),
          id: resultId,
          status: 'invited',
          expiresAt: Date.now() + 48 * 3600000,
        });
        break;
      case 'member-status': {
        const m = s.members.find((m) => m.id === a.id);
        if (!m) throw Error('Member not found.');
        if (m.role === 'member') requirePower(role, 'members');
        else if (role !== 'super-admin')
          throw Error('Only super admin can change administrative access.');
        if (m.role === 'owner')
          throw Error(
            'Owner replacement requires the later secure backend workflow.',
          );
        if (a.status === 'invited' && m.role === 'admin')
          validateSeat(s, 'admin', m.id);
        m.status = a.status;
        m.expiresAt =
          a.status === 'invited' ? Date.now() + 48 * 3600000 : undefined;
        break;
      }
      case 'permissions':
        if (role !== 'super-admin')
          throw Error('Only super admin can assign permissions.');
        s.members = s.members.map((m) =>
          m.id === a.id && m.role === 'admin'
            ? { ...m, permissions: a.permissions }
            : m,
        );
        break;
      case 'expense':
        requirePower(role, 'expenses');
        s.expenses.unshift({ ...a.expense, id: id() });
        break;
      case 'post-expense':
        requirePower(role, 'expenses');
        s.expenses = s.expenses.map((e) =>
          e.id === a.id && e.status === 'draft' ? { ...e, status: 'paid' } : e,
        );
        break;
      case 'reverse':
        if (role !== 'owner')
          throw Error('Only the owner can reverse posted entries.');
        if (!a.reason.trim()) throw Error('A reversal reason is required.');
        if (a.kind === 'payment') {
          const p = s.payments.find((p) => p.id === a.id);
          if (!p || p.status !== 'verified')
            throw Error('Only verified contributions can be reversed.');
          p.status = 'reversed';
          p.reason = a.reason;
        } else {
          const e = s.expenses.find((e) => e.id === a.id);
          if (!e || e.status !== 'paid')
            throw Error('Only paid expenses can be reversed.');
          e.status = 'reversed';
          e.reason = a.reason;
        }
        break;
      case 'balance-check':
        requirePower(role, 'expenses');
        s.checks.unshift({
          id: id(),
          amount: a.amount,
          date: a.date,
          note: a.note,
          recorded: balances(s).bank,
        });
        break;
      case 'transfer':
        requirePower(role, 'expenses');
        if (a.amount > balances(s).cash)
          throw Error('Transfer exceeds recorded cash.');
        s.transfers.push({ amount: a.amount, date: a.date });
        break;
      case 'prayers':
        requirePower(role, 'prayers');
        s.prayers = a.prayers;
        break;
      case 'notice':
        requirePower(role, 'news');
        s.notices.unshift({ ...a.notice, id: id() });
        break;
      case 'toggle-notice':
        requirePower(role, 'news');
        s.notices = s.notices.map((n) =>
          n.id === a.id ? { ...n, published: !n.published } : n,
        );
        break;
      case 'receiving':
        requirePower(role, 'receiving');
        s.receiving = a.receiving;
        break;
      case 'reset':
        state = createSeed();
        return { id: '', state: structuredClone(state) };
    }
    s.audit.unshift(`${new Date().toISOString()} · ${role} · ${a.type}`);
    state = s;
    return { id: resultId, state: structuredClone(s) };
  },
};

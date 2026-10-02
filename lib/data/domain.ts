import { initialPrayers, type Prayer } from '@/config/mosque';
export type Role = 'guest' | 'member' | 'admin' | 'owner' | 'super-admin';
export const permissions = [
  'members',
  'record',
  'verify',
  'expenses',
  'reports',
  'prayers',
  'news',
  'receiving',
] as const;
export type Permission = (typeof permissions)[number];
export const permissionLabels: Record<Permission, string> = {
  members: 'Manage members',
  record: 'Record contributions',
  verify: 'Verify payments',
  expenses: 'Expenses & balance checks',
  reports: 'Export reports',
  prayers: 'Prayer schedules',
  news: 'News & events',
  receiving: 'Receiving details',
};
export type Member = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  status: 'active' | 'invited' | 'inactive' | 'expired';
  role: 'member' | 'admin' | 'owner';
  permissions: Permission[];
  expiresAt?: number;
};
export type Payment = {
  id: string;
  memberId: string;
  amount: number;
  date: string;
  purpose: string;
  method: 'UPI' | 'Cash';
  reference: string;
  status: 'pending' | 'verified' | 'rejected' | 'reversed';
  reason?: string;
  evidence?: string;
  evidenceName?: string;
  evidencePath?: string;
};
export type Expense = {
  id: string;
  amount: number;
  date: string;
  category: string;
  description: string;
  account: 'Bank' | 'Cash';
  status: 'draft' | 'paid' | 'reversed';
  reason?: string;
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  hindiTitle: string;
  hindiBody: string;
  date: string;
  published: boolean;
  image?: string;
};
export type BalanceCheck = {
  id: string;
  amount: number;
  recorded: number;
  date: string;
  note: string;
};
export type DemoState = {
  memberNames?: Record<string, string>;
  members: Member[];
  payments: Payment[];
  expenses: Expense[];
  prayers: Prayer[];
  notices: Notice[];
  checks: BalanceCheck[];
  audit: string[];
  receiving: {
    upi: string;
    recipient: string;
    image?: string;
    qrPath?: string;
  };
  balance?: { bank: number; cash: number; total: number };
  monthly?: {
    month: string;
    receipts: number;
    expenses: number;
    adjustments: number;
  }[];
  transfers: { amount: number; date: string }[];
};
export function createSeed(): DemoState {
  return {
    members: [
      {
        id: 'm1',
        name: 'Sample Member',
        email: 'member@example.com',
        phone: '',
        address: 'Durg',
        status: 'active',
        role: 'member',
        permissions: [],
      },
      {
        id: 'm2',
        name: 'Sample Contributor',
        email: 'contributor@example.com',
        phone: '',
        address: 'Durg',
        status: 'active',
        role: 'member',
        permissions: [],
      },
      {
        id: 'm3',
        name: 'Sample Neighbour',
        email: 'neighbour@example.com',
        phone: '',
        address: 'Durg',
        status: 'active',
        role: 'member',
        permissions: [],
      },
      {
        id: 'a1',
        name: 'Sample Admin',
        email: 'admin@example.com',
        phone: '',
        address: 'Durg',
        status: 'active',
        role: 'admin',
        permissions: [...permissions],
      },
      {
        id: 'o1',
        name: 'Sample Owner',
        email: 'owner@example.com',
        phone: '',
        address: 'Durg',
        status: 'active',
        role: 'owner',
        permissions: [...permissions],
      },
    ],
    payments: [
      {
        id: 'p1',
        memberId: 'm1',
        amount: 150000,
        date: '2026-09-02',
        purpose: 'General support',
        method: 'UPI',
        reference: 'DEMO-001',
        status: 'verified',
      },
      {
        id: 'p2',
        memberId: 'm1',
        amount: 100000,
        date: '2026-09-07',
        purpose: 'Special occasion',
        method: 'UPI',
        reference: 'DEMO-002',
        status: 'pending',
      },
      {
        id: 'p3',
        memberId: 'm1',
        amount: 50000,
        date: '2026-08-15',
        purpose: 'General support',
        method: 'UPI',
        reference: 'DEMO-003',
        status: 'rejected',
        reason: 'The reference did not match the received transaction.',
      },
      {
        id: 'p4',
        memberId: 'm2',
        amount: 1000000,
        date: '2026-09-03',
        purpose: 'General support',
        method: 'UPI',
        reference: 'DEMO-004',
        status: 'verified',
      },
      {
        id: 'p5',
        memberId: 'm3',
        amount: 50000,
        date: '2026-09-04',
        purpose: 'General support',
        method: 'Cash',
        reference: '',
        status: 'verified',
      },
    ],
    expenses: [
      {
        id: 'e1',
        amount: 300000,
        date: '2026-09-04',
        category: 'Utilities',
        description: 'Electricity and water',
        account: 'Bank',
        status: 'paid',
      },
      {
        id: 'e2',
        amount: 250000,
        date: '2026-09-05',
        category: 'Maintenance',
        description: 'Routine maintenance',
        account: 'Bank',
        status: 'paid',
      },
      {
        id: 'e3',
        amount: 150000,
        date: '2026-09-06',
        category: 'Cleaning',
        description: 'Cleaning supplies',
        account: 'Cash',
        status: 'paid',
      },
    ],
    prayers: structuredClone(initialPrayers),
    notices: [
      {
        id: 'n1',
        title: 'Community clean-up',
        body: 'Saturday, after Asr. Everyone is welcome.',
        hindiTitle: 'सामुदायिक सफ़ाई',
        hindiBody: 'शनिवार, अस्र के बाद। सभी का स्वागत है।',
        date: '2026-09-12',
        published: true,
      },
      {
        id: 'n2',
        title: 'Join your mosque community',
        body: 'Speak to an admin at the mosque to become a member.',
        hindiTitle: 'मस्जिद समुदाय से जुड़ें',
        hindiBody: 'सदस्य बनने के लिए व्यवस्थापक से मिलें।',
        date: '2026-09-08',
        published: true,
      },
    ],
    checks: [
      {
        id: 'b1',
        amount: 1980000,
        recorded: 2000000,
        date: '2026-09-07T12:45',
        note: 'Sample check; investigate the difference.',
      },
    ],
    audit: [],
    receiving: { upi: '', recipient: 'Gausul wara masjid' },
    transfers: [],
  };
}
export function can(
  role: Role,
  permission: Permission,
  grants: Permission[] = [...permissions],
) {
  return (
    (role === 'owner' ||
      (role === 'admin' &&
        !['record', 'verify', 'expenses', 'receiving'].includes(permission))) &&
    grants.includes(permission)
  );
}
export function parseAmount(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw Error('Enter a positive amount with up to two decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000)
    throw Error('Enter an amount between ₹0.01 and ₹10,00,000.');
  return amount;
}
export function balances(s: DemoState) {
  if (s.balance) return s.balance;
  let bank = 1400000,
    cash = 600000;
  for (const p of s.payments)
    if (p.status === 'verified') {
      if (p.method === 'UPI') bank += p.amount;
      else cash += p.amount;
    }
  for (const e of s.expenses)
    if (e.status === 'paid') {
      if (e.account === 'Bank') bank -= e.amount;
      else cash -= e.amount;
    }
  for (const t of s.transfers) {
    bank += t.amount;
    cash -= t.amount;
  }
  return { bank, cash, total: bank + cash };
}
export function verifyPayment(
  s: DemoState,
  id: string,
  status: 'verified' | 'rejected',
  reason = '',
) {
  const p = s.payments.find((p) => p.id === id);
  if (!p || p.status !== 'pending')
    throw Error('This submission has already been reviewed.');
  if (status === 'rejected' && !reason.trim())
    throw Error('Enter a reason for rejection.');
  if (
    status === 'verified' &&
    p.reference &&
    s.payments.some(
      (other) =>
        other.id !== id &&
        other.status === 'verified' &&
        other.reference.toLowerCase() === p.reference.toLowerCase(),
    )
  )
    throw Error('This reference is already verified. Check for a duplicate.');
  return {
    ...s,
    payments: s.payments.map((p) =>
      p.id === id ? { ...p, status, reason } : p,
    ),
  };
}
export function validateSeat(
  s: DemoState,
  role: 'admin' | 'owner',
  except?: string,
) {
  const active = s.members.filter(
    (m) =>
      m.id !== except &&
      m.status !== 'inactive' &&
      (!m.expiresAt || m.expiresAt > Date.now()),
  );
  if (role === 'owner' && active.some((m) => m.role === 'owner'))
    throw Error('The owner seat is occupied.');
  if (role === 'admin' && active.filter((m) => m.role === 'admin').length >= 4)
    throw Error('All four admin seats are occupied.');
}
export const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: amount % 100 ? 2 : 0,
  }).format(amount / 100);
export function validateDate(date: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw Error('Enter a valid date.');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
  if (date > today) throw Error('A received payment cannot be in the future.');
}

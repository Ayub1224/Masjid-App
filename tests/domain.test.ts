import { describe, it, expect } from 'vitest';
import {
  createSeed,
  balances,
  parseAmount,
  verifyPayment,
  validateSeat,
  can,
} from '@/lib/data/domain';
import {
  themes,
  themeTokens,
  themeVariables,
  isThemeName,
} from '@/config/themes';
import { demoRepository } from '@/lib/data/repository';
describe('financial preview invariants', () => {
  it('excludes pending/rejected payments and drafts from balances', () => {
    const s = createSeed();
    s.expenses.push({
      id: 'd',
      amount: 100000,
      date: '2026-09-08',
      category: 'Other',
      description: 'Draft',
      account: 'Bank',
      status: 'draft',
    });
    expect(balances(s)).toEqual({
      bank: 2000000,
      cash: 500000,
      total: 2500000,
    });
  });
  it('verifies once and blocks duplicate approval', () => {
    const s = verifyPayment(createSeed(), 'p2', 'verified');
    expect(balances(s).total).toBe(2600000);
    expect(() => verifyPayment(s, 'p2', 'verified')).toThrow();
  });
  it('requires rejection reason and blocks duplicate references', () => {
    expect(() => verifyPayment(createSeed(), 'p2', 'rejected')).toThrow();
    const s = createSeed();
    s.payments[1].reference = 'DEMO-001';
    expect(() => verifyPayment(s, 'p2', 'verified')).toThrow(
      'already verified',
    );
  });
  it('cash to bank preserves total', () => {
    const s = createSeed();
    s.transfers.push({ amount: 100000, date: '2026-09-08' });
    expect(balances(s)).toEqual({
      bank: 2100000,
      cash: 400000,
      total: 2500000,
    });
  });
  it('converts decimals exactly and rejects invalid money', () => {
    expect(parseAmount('0.01')).toBe(1);
    expect(parseAmount('1234.56')).toBe(123456);
    for (const v of ['0', '-1', '2.345', 'NaN', '1e5'])
      expect(() => parseAmount(v)).toThrow();
  });
  it('requires owner for reversals and preserves original record', async () => {
    await demoRepository.mutate('guest', { type: 'reset' });
    await expect(
      demoRepository.mutate('admin', {
        type: 'reverse',
        id: 'p1',
        kind: 'payment',
        reason: 'Correction',
      }),
    ).rejects.toThrow();
    await demoRepository.mutate('owner', {
      type: 'reverse',
      id: 'p1',
      kind: 'payment',
      reason: 'Correction',
    });
    const s = await demoRepository.read();
    expect(s.payments.find((p) => p.id === 'p1')?.status).toBe('reversed');
    expect(s.payments.find((p) => p.id === 'p1')?.reason).toBe('Correction');
    expect(balances(s).total).toBe(2350000);
  });
  it('bank observations never change recorded balances', async () => {
    await demoRepository.mutate('guest', { type: 'reset' });
    await demoRepository.mutate('owner', {
      type: 'balance-check',
      amount: 1980000,
      date: '2026-09-08T12:00',
      note: 'sample',
    });
    expect(balances(await demoRepository.read()).total).toBe(2500000);
  });
});
describe('permissions and capacity', () => {
  it('keeps owner and super-admin powers separate', () => {
    expect(can('owner', 'verify')).toBe(true);
    expect(can('super-admin', 'verify')).toBe(false);
    expect(can('admin', 'verify', [])).toBe(false);
  });
  it('blocks a second owner and fifth ordinary admin', () => {
    const s = createSeed();
    expect(() => validateSeat(s, 'owner')).toThrow('occupied');
    for (let i = 0; i < 3; i++)
      s.members.push({
        ...s.members[3],
        id: `x${i}`,
        email: `x${i}@example.com`,
      });
    expect(() => validateSeat(s, 'admin')).toThrow('four');
    s.members.at(-1)!.status = 'inactive';
    expect(() => validateSeat(s, 'admin')).not.toThrow();
  });
  it('applies revoked demo permissions to mutations', async () => {
    await demoRepository.mutate('guest', { type: 'reset' });
    await demoRepository.mutate('super-admin', {
      type: 'permissions',
      id: 'a1',
      permissions: [],
    });
    await expect(
      demoRepository.mutate('admin', {
        type: 'review',
        id: 'p2',
        status: 'verified',
      }),
    ).rejects.toThrow('permission');
  });
});
describe('theme config', () => {
  it('every registered theme provides all semantic tokens', () => {
    for (const [name, t] of Object.entries(themes)) {
      expect(Object.keys(t.colors).sort()).toEqual([...themeTokens].sort());
      expect(themeVariables(name as keyof typeof themes)['--primary']).toBe(
        t.colors.primary,
      );
    }
    expect(isThemeName('invalid')).toBe(false);
  });
});

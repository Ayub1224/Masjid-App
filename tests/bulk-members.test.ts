import { expect, it } from 'vitest';
import {
  bulkMembersInput,
  bulkRemoveInput,
  changePinInput,
} from '../lib/bulk-members';
const row = { name: 'Member', phone: '9876543210', address: 'Durg' };
it('normalizes phones and preserves leading zero PINs', () => {
  expect(bulkMembersInput.parse({ members: [row] }).members[0]).toEqual({
    ...row,
    phone: '+919876543210',
    pin: '0000',
  });
  expect(
    bulkMembersInput.parse({ members: [{ ...row, pin: '0123' }] }).members[0]
      .pin,
  ).toBe('0123');
});
it('rejects duplicate phone aliases, privilege injection and batches above 100', () => {
  expect(
    bulkMembersInput.safeParse({
      members: [row, { ...row, phone: '+91 9876543210' }],
    }).success,
  ).toBe(false);
  expect(
    bulkMembersInput.safeParse({ members: [{ ...row, role: 'owner' }] })
      .success,
  ).toBe(false);
  expect(
    bulkMembersInput.safeParse({
      members: Array.from({ length: 101 }, (_, i) => ({
        ...row,
        phone: String(9000000000 + i),
      })),
    }).success,
  ).toBe(false);
  expect(
    bulkMembersInput.safeParse({ members: [{ ...row, phone: '123' }] }).success,
  ).toBe(false);
});
it('requires non-default replacement PIN and unique removal targets', () => {
  expect(
    changePinInput.safeParse({ currentPin: '0000', pin: '0000' }).success,
  ).toBe(false);
  expect(
    changePinInput.safeParse({ currentPin: '1234', pin: '1234' }).success,
  ).toBe(false);
  expect(
    changePinInput.safeParse({ currentPin: '0000', pin: '0123' }).success,
  ).toBe(true);
  const id = '00000000-0000-4000-8000-000000000001';
  expect(bulkRemoveInput.safeParse({ ids: [id, id] }).success).toBe(false);
});

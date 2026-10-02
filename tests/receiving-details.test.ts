import { expect, it } from 'vitest';
import { receivingDetails } from '../lib/receiving-details';
import { commandSchema } from '../lib/server/validation';
it('reports the UPI field for the recipient-name mistake shown in the form', () => {
  const result = receivingDetails.safeParse({
    recipient: 'Gausul Wara Masjid',
    upi: 'Gausul wara Majid',
  });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues[0].path).toEqual(['upi']);
});
it('requires recipient and UPI and shares server normalization', () => {
  expect(receivingDetails.safeParse({ recipient: ' ', upi: '' }).success).toBe(
    false,
  );
  const input = { recipient: ' Masjid ', upi: ' masjid@bank ' };
  expect(receivingDetails.parse(input)).toEqual({
    recipient: 'Masjid',
    upi: 'masjid@bank',
  });
  expect(
    commandSchema.safeParse({
      type: 'receiving',
      ...input,
      qrPath:
        '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.png',
    }).success,
  ).toBe(true);
});

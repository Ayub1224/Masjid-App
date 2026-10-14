import { z } from 'zod';
import { indianMobile } from './administrator-invitation';

export const bulkMember = z.strictObject({
  name: z.string().trim().min(1, 'Enter a name.').max(100),
  phone: z
    .string()
    .trim()
    .max(25)
    .refine((v) => !!indianMobile(v), 'Enter a valid Indian mobile number.')
    .transform((v) => indianMobile(v)!),
  address: z.string().trim().min(1, 'Enter an address.').max(500),
  pin: z
    .string()
    .regex(/^\d{4}$/, 'Use a four-digit PIN.')
    .default('0000'),
});
export const bulkMembersInput = z
  .strictObject({
    members: z.array(bulkMember).min(1).max(100),
  })
  .superRefine(({ members }, ctx) => {
    const seen = new Set<string>();
    members.forEach((member, index) => {
      if (seen.has(member.phone))
        ctx.addIssue({
          code: 'custom',
          path: ['members', index, 'phone'],
          message: 'This phone number appears more than once.',
        });
      seen.add(member.phone);
    });
  });
export const bulkRemoveInput = z.strictObject({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const changePinInput = z
  .strictObject({
    currentPin: z.string().regex(/^\d{4}$/),
    pin: z
      .string()
      .regex(/^\d{4}$/)
      .refine((v) => v !== '0000', 'Choose a PIN other than 0000.'),
  })
  .refine((v) => v.pin !== v.currentPin, 'Choose a different PIN.');

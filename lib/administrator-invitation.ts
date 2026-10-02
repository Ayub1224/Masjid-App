import { z } from 'zod';
import { permissions, type Permission } from './data/domain';

export const paymentPermissions: Permission[] = [
  'record',
  'verify',
  'expenses',
  'receiving',
];
export function indianMobile(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, '');
  const match = /^(?:\+91|91)?([6-9][0-9]{9})$/.exec(compact);
  return match ? `+91${match[1]}` : null;
}
export function profileInput(_role: string) {
  return z
    .object({
      name: z.string().trim().min(1, 'Enter the full name.').max(100),
      phone: z.string().trim().max(25),
      address: z.string().trim().max(500),
    })
    .superRefine((input, ctx) => {
      if (!indianMobile(input.phone))
        ctx.addIssue({
          code: 'custom',
          path: ['phone'],
          message:
            'Enter a valid 10-digit Indian mobile number, optionally with +91.',
        });
      if (!input.address)
        ctx.addIssue({
          code: 'custom',
          path: ['address'],
          message: 'Enter the address.',
        });
    })
    .transform((input) => ({
      ...input,
      phone: indianMobile(input.phone) ?? '',
    }));
}
export const invitationInput = z
  .strictObject({
    name: z.string().trim().min(1, 'Enter the full name.').max(100),
    email: z.string().trim().toLowerCase().max(254).default(''),
    phone: z.string().trim().max(25).default(''),
    address: z.string().trim().max(500).default(''),
    role: z.enum(['member', 'admin', 'owner']),
    permissions: z.array(z.enum(permissions)).max(8).default([]),
  })
  .superRefine((input, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (
      (input.role === 'owner' || input.email) &&
      !z.email().safeParse(input.email).success
    )
      issue(
        'email',
        input.email
          ? 'Enter a valid email address.'
          : 'Enter an email address.',
      );
    {
      if (!indianMobile(input.phone))
        issue(
          'phone',
          'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9. You can include +91.',
        );
      if (!input.address) issue('address', 'Enter the address.');
    }
    if (
      input.role === 'admin' &&
      input.permissions.some((p) => paymentPermissions.includes(p))
    )
      issue('permissions', 'Payment permissions are unavailable to admins.');
  })
  .transform((input) => ({
    ...input,
    phone: indianMobile(input.phone) ?? input.phone,
  }));

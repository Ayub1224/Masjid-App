import { z } from 'zod';
const uuid = z.uuid();
const short = z.string().trim().min(1).max(200);
const amount = z.number().int().positive().max(100000000);
const nonnegative = z.number().int().min(0).max(100000000);
const date = z.iso
  .date()
  .refine(
    (v) =>
      v >= '2000-01-01' &&
      v <=
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
          new Date(),
        ),
    'Invalid date',
  );
const permission = z.enum([
  'members',
  'record',
  'verify',
  'expenses',
  'reports',
  'prayers',
  'news',
  'receiving',
]);
const reason = z.string().trim().min(1).max(500);
const path = z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp)$/);
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('submit'),
    amountPaise: amount,
    date,
    purpose: short,
    reference: z.string().trim().min(6).max(100),
    evidencePath: path,
  }),
  z.strictObject({
    type: z.literal('cash'),
    amountPaise: amount,
    date,
    purpose: short,
    memberId: uuid,
  }),
  z.strictObject({
    type: z.literal('review'),
    id: uuid,
    status: z.enum(['verified', 'rejected']),
    reason: reason.optional(),
  }),
  z.strictObject({
    type: z.literal('expense'),
    amountPaise: amount,
    date,
    category: short.max(80),
    description: reason,
    account: z.enum(['Bank', 'Cash']),
    status: z.enum(['draft', 'paid']),
  }),
  z.strictObject({ type: z.literal('post-expense'), id: uuid }),
  z.strictObject({ type: z.literal('reverse'), id: uuid, reason }),
  z.strictObject({ type: z.literal('transfer'), amountPaise: amount, date }),
  z.strictObject({
    type: z.literal('opening'),
    amountPaise: nonnegative,
    cashPaise: nonnegative,
    date,
  }),
  z.strictObject({
    type: z.literal('balance-check'),
    amountPaise: nonnegative,
    date,
    note: reason,
  }),
  z.strictObject({
    type: z.literal('invite'),
    email: z.email().max(254),
    name: short.max(120),
    phone: z.string().max(25).default(''),
    address: z.string().max(500).default(''),
    role: z.enum(['member', 'admin', 'owner']),
    permissions: z.array(permission).max(8).default([]),
  }),
  z.strictObject({
    type: z.literal('accept-invite'),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({ type: z.literal('revoke-invite'), id: uuid }),
  z.strictObject({ type: z.literal('deactivate'), id: uuid }),
  z.strictObject({
    type: z.literal('permissions'),
    id: uuid,
    permissions: z.array(permission).max(8),
  }),
  z.strictObject({
    type: z.literal('prayers'),
    prayers: z
      .array(
        z.strictObject({
          name: z.enum(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Jumuah']),
          adhan: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          jamaat: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        }),
      )
      .min(5)
      .max(6),
  }),
  z.strictObject({
    type: z.literal('notice'),
    title: short.max(160),
    text: z.string().trim().min(1).max(4000),
    hindiTitle: z.string().max(160).default(''),
    hindiBody: z.string().max(4000).default(''),
    date: z.iso.date(),
    published: z.boolean(),
  }),
  z.strictObject({ type: z.literal('toggle-notice'), id: uuid }),
  z.strictObject({
    type: z.literal('receiving'),
    upi: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9.-]{2,64}$/),
    recipient: short.max(120),
    qrPath: path,
  }),
]);
export const credentials = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
  captchaToken: z.string().min(1).max(2048),
  remember: z.boolean().default(false),
});
export const registration = credentials.extend({
  password: z.string().min(12).max(128),
  invitationToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const fileRequest = z.strictObject({
  bucket: z.enum(['payment-evidence', 'mosque-qr']),
  path,
});

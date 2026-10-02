import { z } from 'zod';

export const receivingDetails = z.object({
  recipient: z
    .string()
    .trim()
    .min(1, 'Enter the recipient name.')
    .max(120, 'Use no more than 120 characters.'),
  upi: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9.-]{2,64}$/,
      'Enter a valid UPI ID, such as masjid@bank. A recipient name is not a UPI ID.',
    ),
});

import { z } from 'zod';
export const mosqueDetailsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  picture: z
    .string()
    .max(700000)
    .refine(
      (v) =>
        v === '' ||
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v),
      'Use a PNG, JPEG, or WebP image',
    ),
});
export type MosqueDetails = z.infer<typeof mosqueDetailsSchema>;

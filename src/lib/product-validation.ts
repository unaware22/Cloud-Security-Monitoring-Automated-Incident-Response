import { z } from 'zod';

export const ProductWriteSchema = z.object({
  name: z.string().trim().min(2).max(150),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(150)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung'),
  description: z.string().trim().max(2_000).optional(),
  price: z.number().int().positive(),
  discount_percent: z.number().int().min(0).max(99).optional().nullable(),
  original_price: z.number().int().positive().optional().nullable(),
  stock: z.number().int().min(0),
  sort_order: z.number().int().min(0).optional(),
  service_tag: z.enum(['proses-instant', 'pembuatan-cepat', 'proses-cepat']).default('proses-instant'),
  sold_count: z.string().trim().max(50).optional().default('19rb+ Terjual'),
  product_type: z.string().trim().min(1).max(50).default('digital'),
  game: z.enum(['minecraft', 'roblox']),
  sub_category_1: z.string().trim().min(1).max(80),
  sub_category_2: z.string().trim().max(80).nullable().optional(),
  delivery_type: z.enum(['automatic', 'manual']).default('automatic'),
  delivery_category: z.enum(['account', 'redeem_code', 'roblox', 'jasa']).nullable().optional(),
  delivery_content: z
    .string()
    .min(1, 'Data pengiriman produk digital wajib diisi')
    .max(100_000),
  image_url: z.string().max(900_000, 'Gambar terlalu besar. Pilih ulang gambar agar dikompresi.').optional().or(z.literal('')),
  is_active: z.boolean().default(true),
});

export function firstValidationMessage(error: z.ZodError): string {
  return error.errors[0]?.message || 'Data produk tidak valid';
}

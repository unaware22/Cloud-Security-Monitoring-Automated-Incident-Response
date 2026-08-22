import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getClientIp } from '@/lib/security';
import {
  getAllFallbackProducts,
  addFallbackProduct,
  getFallbackProductBySlug,
} from '@/lib/products-store';

export const dynamic = 'force-dynamic';

const CreateProductSchema = z.object({
  name: z.string().trim().min(2).max(150),
  slug: z.string().trim().min(2).max(150),
  description: z.string().trim().optional(),
  price: z.number().int().positive(),
  discount_percent: z.number().int().min(0).max(99).optional().default(0),
  original_price: z.number().int().positive().optional().nullable(),
  stock: z.number().int().min(0),
  sort_order: z.number().int().optional(),
  service_tag: z.enum(['proses-instant', 'pembuatan-cepat']).default('proses-instant'),
  sold_count: z.string().trim().optional().default('19rb+ Terjual'),
  product_type: z.string().default('digital'),
  game: z.enum(['minecraft', 'roblox']),
  sub_category_1: z.string().min(1),
  sub_category_2: z.string().nullable().optional(),
  delivery_type: z.enum(['automatic', 'manual']).default('automatic'),
  delivery_content: z.string().min(1, 'Delivery content is required for digital goods'),
  image_url: z.string().optional().or(z.literal('')),
  is_active: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { isDatabaseOnline } = await import('@/lib/db-store');
  const dbOnline = await isDatabaseOnline();

  if (dbOnline) {
    try {
      const products = await prisma.product.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });

      if (products && products.length > 0) {
        return NextResponse.json({
          success: true,
          count: products.length,
          data: products,
        });
      }
    } catch (error) {
      console.warn('[Admin Products] DB query error, serving fallback...');
    }
  }

  const fallbackList = getAllFallbackProducts();
  return NextResponse.json({
    success: true,
    count: fallbackList.length,
    data: fallbackList,
  });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';

  try {
    const body = await req.json();
    const parseResult = CreateProductSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: parseResult.error.errors },
        { status: 422 }
      );
    }

    const data = parseResult.data;

    // Try database insertion first
    try {
      // Check slug uniqueness
      const existing = await prisma.product.findUnique({
        where: { slug: data.slug },
      });

      if (existing) {
        return NextResponse.json(
          { error: 'Conflict', message: 'Product slug already exists' },
          { status: 409 }
        );
      }

      const product = await prisma.product.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          price: data.price,
          stock: data.stock,
          sortOrder: data.sort_order ?? 0,
          serviceTag: data.service_tag || 'proses-instant',
          soldCount: data.sold_count || '19rb+ Terjual',
          productType: data.product_type,
          game: data.game,
          subCategory1: data.sub_category_1,
          subCategory2: data.sub_category_2,
          deliveryType: data.delivery_type,
          deliveryContent: data.delivery_content,
          imageUrl: data.image_url || null,
          isActive: data.is_active,
        },
      });

      // Write Audit Log
      try {
        await prisma.auditLog.create({
          data: {
            adminId: session.userId,
            action: 'PRODUCT_CREATE',
            entityType: 'products',
            entityId: product.id,
            newValue: JSON.stringify(product),
            ipAddress: ip,
            userAgent,
          },
        });
      } catch {}

      // Also sync to fallback store
      addFallbackProduct({
        name: product.name,
        slug: product.slug,
        description: product.description || '',
        price: product.price,
        stock: product.stock,
        sortOrder: product.sortOrder,
        serviceTag: product.serviceTag,
        soldCount: product.soldCount,
        productType: product.productType,
        game: product.game as any,
        subCategory1: product.subCategory1,
        subCategory2: product.subCategory2,
        deliveryType: product.deliveryType as any,
        deliveryContent: product.deliveryContent || '',
        imageUrl: product.imageUrl,
        isActive: product.isActive,
      });

      return NextResponse.json({ success: true, data: product }, { status: 201 });
    } catch (dbErr) {
      console.warn('[Admin Products] Database offline, saving product into fallback store...');
      
      const existingFallback = getFallbackProductBySlug(data.slug);
      if (existingFallback) {
        return NextResponse.json(
          { error: 'Conflict', message: 'Product slug already exists' },
          { status: 409 }
        );
      }

      const fallbackProd = addFallbackProduct({
        name: data.name,
        slug: data.slug,
        description: data.description || '',
        price: data.price,
        discountPercent: data.discount_percent,
        originalPrice: data.original_price,
        stock: data.stock,
        sortOrder: data.sort_order,
        serviceTag: data.service_tag,
        soldCount: data.sold_count,
        productType: data.product_type,
        game: data.game,
        subCategory1: data.sub_category_1,
        subCategory2: data.sub_category_2,
        deliveryType: data.delivery_type,
        deliveryContent: data.delivery_content,
        imageUrl: data.image_url || null,
        isActive: data.is_active,
      });

      return NextResponse.json({ success: true, data: fallbackProd }, { status: 201 });
    }
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

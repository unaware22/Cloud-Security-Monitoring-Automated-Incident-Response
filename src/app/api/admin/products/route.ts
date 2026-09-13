import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getClientIp } from '@/lib/security';
import { isInMemoryFallbackEnabled } from '@/lib/db-store';
import { invalidatePublicProductCatalog } from '@/lib/public-product-catalog';
import { firstValidationMessage, ProductWriteSchema } from '@/lib/product-validation';
import { withProductImageUrl } from '@/lib/product-image';
import {
  getAllFallbackProducts,
  addFallbackProduct,
  getFallbackProductBySlug,
} from '@/lib/products-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const products = await prisma.product.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        originalPrice: true,
        discountPercent: true,
        stock: true,
        sortOrder: true,
        productType: true,
        deliveryContent: true,
        game: true,
        subCategory1: true,
        subCategory2: true,
        deliveryType: true,
        deliveryCategory: true,
        serviceTag: true,
        soldCount: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const productsWithImageUrls = products.map(withProductImageUrl);

    return NextResponse.json({
      success: true,
      count: productsWithImageUrls.length,
      data: productsWithImageUrls,
      source: 'rds',
    });
  } catch (error) {
    console.error('[Admin Products] RDS query failed:', error);
    if (!isInMemoryFallbackEnabled()) {
      return NextResponse.json(
        {
          error: 'Database Error',
          message: 'Katalog admin gagal dibaca dari RDS. Periksa log aplikasi.',
        },
        { status: 500 }
      );
    }
  }

  const fallbackList = getAllFallbackProducts().map(withProductImageUrl);
  return NextResponse.json({
    success: true,
    count: fallbackList.length,
    data: fallbackList,
    source: 'development-fallback',
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
    const parseResult = ProductWriteSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: firstValidationMessage(parseResult.error),
          details: parseResult.error.errors,
        },
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
          originalPrice: data.original_price,
          discountPercent: data.discount_percent,
          stock: data.stock,
          sortOrder: data.sort_order ?? 0,
          serviceTag: data.service_tag || 'proses-instant',
          soldCount: data.sold_count || '19rb+ Terjual',
          productType: data.product_type,
          game: data.game,
          subCategory1: data.sub_category_1,
          subCategory2: data.sub_category_2,
          deliveryType: data.delivery_type,
          deliveryCategory: data.delivery_category,
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

      invalidatePublicProductCatalog();
      return NextResponse.json(
        { success: true, data: withProductImageUrl(product) },
        { status: 201 }
      );
    } catch (dbErr) {
      console.error('[Admin Products] RDS create failed:', dbErr);
      if (!isInMemoryFallbackEnabled()) {
        return NextResponse.json(
          {
            error: 'Database Error',
            message: 'Produk tidak tersimpan ke RDS. Pastikan migration terbaru sudah diterapkan.',
          },
          { status: 500 }
        );
      }

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
        deliveryCategory: data.delivery_category ?? undefined,
        deliveryContent: data.delivery_content,
        imageUrl: data.image_url || null,
        isActive: data.is_active,
      });

      return NextResponse.json(
        {
          success: true,
          data: withProductImageUrl(fallbackProd),
          source: 'development-fallback',
        },
        { status: 201 }
      );
    }
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
